namespace ANUPlanner.Models;

public class DegreeRequirement
{
    public string DegreeId { get; set; } = "";
    public string DegreeName { get; set; } = "";
    public int RequiredUnits { get; set; }

    /// <summary>
    /// Each inner list is an OR group: any one course in the group satisfies that requirement.
    /// Single-item groups are mandatory individual courses.
    /// </summary>
    public List<List<string>> CoreCourseGroups { get; set; } = new();

    /// <summary>Flattened list of all individual course codes across all groups (for filtering/display).</summary>
    public List<string> CoreCourses { get; set; } = new();
}
