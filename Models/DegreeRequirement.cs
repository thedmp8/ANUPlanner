namespace ANUPlanner.Models;

public class DegreeRequirement
{
    public string DegreeId { get; set; } = "";
    public string DegreeName { get; set; } = "";
    public int RequiredUnits { get; set; }
    public List<string> CoreCourses { get; set; } = new();
}
