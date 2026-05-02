namespace ANUPlanner.Models;

public class PlanValidationSummary
{
    public int TotalUnitsPlanned { get; set; }
    public int TotalUnitsRequired { get; set; }
    public int RemainingUnits => Math.Max(0, TotalUnitsRequired - TotalUnitsPlanned);

    public List<string> CoreCoursesCompleted { get; set; } = new();
    public List<string> CoreCoursesMissing { get; set; } = new();

    public List<ValidationIssue> Issues { get; set; } = new();

    public IEnumerable<ValidationIssue> Errors => Issues.Where(i => i.Severity == IssueSeverity.Error);
    public IEnumerable<ValidationIssue> Warnings => Issues.Where(i => i.Severity == IssueSeverity.Warning);
    public IEnumerable<ValidationIssue> ManualReviews => Issues.Where(i => i.Severity == IssueSeverity.ManualReview);

    public bool IsValid => !Errors.Any() && CoreCoursesMissing.Count == 0 && TotalUnitsPlanned >= TotalUnitsRequired;
}
