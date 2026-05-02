using ANUPlanner.Models;

namespace ANUPlanner.Services;

public class PlannerValidationService
{
    private readonly CourseDataService _courseData;
    private readonly DegreeDataService _degreeData;

    public PlannerValidationService(CourseDataService courseData, DegreeDataService degreeData)
    {
        _courseData = courseData;
        _degreeData = degreeData;
    }

    public PlanValidationSummary Validate(DegreePlan plan)
    {
        var summary = new PlanValidationSummary();
        var degree = _degreeData.Get(plan.DegreeId);

        summary.TotalUnitsRequired = degree?.RequiredUnits ?? 0;

        // ── Resolve offerings for each planned course ─────────────────────
        foreach (var pc in plan.Courses)
        {
            var calYear = plan.CalendarYearFor(pc.PlanYear);
            pc.Offering = _courseData.GetOffering(pc.CourseCode, calYear);
            pc.IsFallbackYear = pc.Offering != null && _courseData.IsFallback(pc.CourseCode, calYear);
            pc.IsUnavailable = pc.Offering == null;
        }

        // ── Units ─────────────────────────────────────────────────────────
        summary.TotalUnitsPlanned = plan.Courses
            .Where(c => !c.IsUnavailable)
            .Sum(c => c.Offering!.Units);

        // ── Duplicate courses ─────────────────────────────────────────────
        var duplicates = plan.Courses
            .GroupBy(c => c.CourseCode)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key);
        foreach (var dup in duplicates)
            summary.Issues.Add(new ValidationIssue
            {
                Severity = IssueSeverity.Error,
                CourseCode = dup,
                Message = $"{dup} appears more than once in your plan.",
            });

        // ── Core course completion ─────────────────────────────────────────
        if (degree != null)
        {
            var plannedCodes = plan.Courses.Select(c => c.CourseCode).ToHashSet();
            summary.CoreCoursesCompleted = new List<string>();
            summary.CoreCoursesMissing = new List<string>();

            foreach (var req in degree.CoreCourses)
            {
                var options = req.Split('|').Select(c => c.Trim()).ToList();
                int matchCount = options.Count(c => plannedCodes.Contains(c));

                if (matchCount == 1)
                {
                    summary.CoreCoursesCompleted.Add(req);
                }
                else if (matchCount == 0)
                {
                    summary.CoreCoursesMissing.Add(req);
                    var displayMissing = req.Contains('|') ? req.Replace("|", " or ") : req;
                    summary.Issues.Add(new ValidationIssue
                    {
                        Severity = IssueSeverity.Error,
                        CourseCode = req,
                        Message = $"Core course {displayMissing} is missing from your plan.",
                    });
                }
                else
                {
                    // XOR violation (more than one taken)
                    summary.CoreCoursesCompleted.Add(req);
                    var displayTooMany = req.Replace("|", " and ");
                    summary.Issues.Add(new ValidationIssue
                    {
                        Severity = IssueSeverity.Error,
                        CourseCode = req,
                        Message = $"Mutually exclusive courses planned: {displayTooMany}. Please choose exactly one.",
                    });
                }
            }
        }

        // ── Per-course validation ─────────────────────────────────────────
        foreach (var pc in plan.Courses)
        {
            var calYear = plan.CalendarYearFor(pc.PlanYear);

            if (pc.IsUnavailable)
            {
                summary.Issues.Add(new ValidationIssue
                {
                    Severity = IssueSeverity.Error,
                    CourseCode = pc.CourseCode,
                    Message = $"{pc.CourseCode} has no course data and cannot be verified.",
                });
                continue;
            }

            var offering = pc.Offering!;

            // Fallback warning
            if (pc.IsFallbackYear)
                summary.Issues.Add(new ValidationIssue
                {
                    Severity = IssueSeverity.Warning,
                    CourseCode = pc.CourseCode,
                    Message = $"{pc.CourseCode} in {calYear}: using {offering.Year} data as fallback — check current availability.",
                });

            // ── Offering / semester availability ──────────────────────────
            ValidateSemesterOffering(pc, offering, summary);

            // ── Prerequisites ─────────────────────────────────────────────
            ValidatePrerequisites(pc, plan, summary);

            // ── Incompatibilities ─────────────────────────────────────────
            ValidateIncompatibilities(pc, plan, summary);
        }

        // ── Semester overload (>4 courses per sem = warning) ──────────────
        foreach (var (py, sem) in plan.AllSlots())
        {
            var courses = plan.CoursesIn(py, sem).ToList();
            int semUnits = courses.Where(c => !c.IsUnavailable)
                                  .Sum(c => c.Offering?.Units ?? 6);
            if (semUnits > 24)
                summary.Issues.Add(new ValidationIssue
                {
                    Severity = IssueSeverity.Warning,
                    CourseCode = "",
                    Message = $"Year {py} {OfferingParserService.DisplayLabel(sem)}: {semUnits} units planned (standard load is ≤24).",
                });
        }

        return summary;
    }

    private void ValidateSemesterOffering(PlannedCourse pc, CourseOffering offering, PlanValidationSummary summary)
    {
        if (offering.ParsedTerms.Count == 0)
        {
            // Could not determine offering
            if (!string.IsNullOrWhiteSpace(offering.TermsOffered) &&
                !IsNullLike(offering.TermsOffered))
                summary.Issues.Add(new ValidationIssue
                {
                    Severity = IssueSeverity.ManualReview,
                    CourseCode = pc.CourseCode,
                    Message = $"{pc.CourseCode}: offering text '{offering.TermsOffered}' could not be parsed — verify manually.",
                });
            return;
        }

        if (!OfferingParserService.IsOfferedIn(offering.ParsedTerms, pc.Semester))
            summary.Issues.Add(new ValidationIssue
            {
                Severity = IssueSeverity.Error,
                CourseCode = pc.CourseCode,
                Message = $"{pc.CourseCode} is not offered in {OfferingParserService.DisplayLabel(pc.Semester)} " +
                          $"(offered: {string.Join(", ", offering.ParsedTerms.Select(OfferingParserService.DisplayLabel))}).",
            });
    }

    private void ValidatePrerequisites(PlannedCourse pc, DegreePlan plan, PlanValidationSummary summary)
    {
        var offering = pc.Offering!;
        if (string.IsNullOrWhiteSpace(offering.PrereqRaw)) return;

        var rule = PrerequisiteParserService.Parse(offering.PrereqRaw);

        if (!rule.ParsedConfidently)
        {
            summary.Issues.Add(new ValidationIssue
            {
                Severity = IssueSeverity.ManualReview,
                CourseCode = pc.CourseCode,
                Message = $"{pc.CourseCode}: prerequisite '{offering.PrereqRaw}' requires manual review.",
                Detail = rule.MinMark.HasValue
                    ? $"Mark requirement: ≥{rule.MinMark}. Marks cannot be verified automatically."
                    : "Complex or unit-based prerequisite — verify manually.",
            });
            // Still check any course codes we did extract
        }

        if (rule.CourseCodes.Count == 0 && rule.MinUnits == null) return;

        // Get codes completed before this semester
        var completedBefore = plan.CoursesBefore(pc.PlanYear, pc.Semester)
                                  .Select(c => c.CourseCode)
                                  .ToHashSet();

        if (rule.CourseCodes.Count > 0)
        {
            bool satisfied = rule.Logic == PrereqLogic.AnyOf
                ? rule.CourseCodes.Any(c => completedBefore.Contains(c))
                : rule.CourseCodes.All(c => completedBefore.Contains(c));

            if (!satisfied)
            {
                var missing = rule.Logic == PrereqLogic.AnyOf
                    ? rule.CourseCodes
                    : rule.CourseCodes.Where(c => !completedBefore.Contains(c)).ToList();

                summary.Issues.Add(new ValidationIssue
                {
                    Severity = IssueSeverity.Error,
                    CourseCode = pc.CourseCode,
                    Message = rule.Logic == PrereqLogic.AnyOf
                        ? $"{pc.CourseCode}: prerequisite not met — need one of: {string.Join(", ", rule.CourseCodes)}."
                        : $"{pc.CourseCode}: prerequisites not met — missing: {string.Join(", ", missing)}.",
                    Detail = $"Raw: {offering.PrereqRaw}",
                });
            }
        }
    }

    private void ValidateIncompatibilities(PlannedCourse pc, DegreePlan plan, PlanValidationSummary summary)
    {
        var offering = pc.Offering!;
        if (offering.IncompatibilityCodes.Count == 0) return;

        var allPlannedCodes = plan.Courses
            .Where(c => c.Id != pc.Id)
            .Select(c => c.CourseCode)
            .ToHashSet();

        var conflicts = offering.IncompatibilityCodes
            .Where(ic => allPlannedCodes.Contains(ic))
            .ToList();

        foreach (var conflict in conflicts)
            summary.Issues.Add(new ValidationIssue
            {
                Severity = IssueSeverity.Error,
                CourseCode = pc.CourseCode,
                Message = $"{pc.CourseCode} is incompatible with {conflict}, which is also in your plan.",
                Detail = $"Raw incompatibilities: {offering.IncompatibilityRaw}",
            });
    }

    private static bool IsNullLike(string s)
    {
        var t = s.Trim().ToUpperInvariant();
        return t is "NA" or "N/A" or "NONE" or "NULL" or "" or "UNKNOWN";
    }
}
