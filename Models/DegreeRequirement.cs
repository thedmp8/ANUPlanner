namespace ANUPlanner.Models;

public class DegreeRequirement
{
    private const int UnitsPerAcademicYear = 48;

    public string DegreeId { get; set; } = "";
    public string DegreeName { get; set; } = "";
    public int RequiredUnits { get; set; }
    public List<string> CoreCourses { get; set; } = new();

    public int EstimatedYears => Math.Max(1, (int)Math.Ceiling(RequiredUnits / (double)UnitsPerAcademicYear));
}
