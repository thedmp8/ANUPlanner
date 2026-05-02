using ANUPlanner.Models;

namespace ANUPlanner.Services;

/// <summary>Holds the live degree plan and fires events on change.</summary>
public class PlanStateService
{
    public DegreePlan Plan { get; private set; } = new();
    public event Action? OnChange;

    public void SetPlan(DegreePlan plan)
    {
        Plan = plan;
        NotifyStateChanged();
    }

    public void AddCourse(string courseCode, int planYear, string semester)
    {
        if (Plan.Courses.Any(c => c.CourseCode == courseCode && c.PlanYear == planYear && c.Semester == semester))
            return;

        Plan.Courses.Add(new PlannedCourse
        {
            CourseCode = courseCode.ToUpperInvariant(),
            PlanYear = planYear,
            Semester = semester,
        });
        NotifyStateChanged();
    }

    public void RemoveCourse(Guid id)
    {
        Plan.Courses.RemoveAll(c => c.Id == id);
        NotifyStateChanged();
    }

    public void MoveCourse(Guid id, int newPlanYear, string newSemester)
    {
        var course = Plan.Courses.FirstOrDefault(c => c.Id == id);
        if (course == null) return;
        course.PlanYear = newPlanYear;
        course.Semester = newSemester;
        NotifyStateChanged();
    }

    public void Reset()
    {
        Plan = new DegreePlan
        {
            DegreeId = Plan.DegreeId,
            StartYear = Plan.StartYear,
            NumberOfYears = Plan.NumberOfYears,
            EnabledSemesters = Plan.EnabledSemesters,
        };
        NotifyStateChanged();
    }

    public string ExportJson()
    {
        return System.Text.Json.JsonSerializer.Serialize(Plan, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
        });
    }

    public string ExportCsv()
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("CourseCode,PlanYear,CalendarYear,Semester,Title,Units");
        foreach (var c in Plan.Courses.OrderBy(c => c.PlanYear).ThenBy(c => c.Semester))
        {
            var calYear = Plan.CalendarYearFor(c.PlanYear);
            var title = c.Offering?.Title ?? "";
            var units = c.Offering?.Units ?? 6;
            sb.AppendLine($"{c.CourseCode},{c.PlanYear},{calYear},{c.Semester},\"{title}\",{units}");
        }
        return sb.ToString();
    }

    private void NotifyStateChanged() => OnChange?.Invoke();
}
