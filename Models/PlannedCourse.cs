namespace ANUPlanner.Models;

public class PlannedCourse
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string CourseCode { get; set; } = "";
    public int PlanYear { get; set; }
    public string Semester { get; set; } = "";

    // Resolved from CSV for the relevant calendar year
    public CourseOffering? Offering { get; set; }

    // True when data was sourced from 2027 fallback
    public bool IsFallbackYear { get; set; }
    // True when no offering row exists at all
    public bool IsUnavailable { get; set; }
}
