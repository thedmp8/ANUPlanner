namespace ANUPlanner.Models;

public enum PrereqLogic { AnyOf, AllOf, Unknown }

public class PrerequisiteRule
{
    public PrereqLogic Logic { get; set; } = PrereqLogic.AnyOf;
    public List<string> CourseCodes { get; set; } = new();
    public int? MinUnits { get; set; }
    public string? SubjectArea { get; set; }
    public int? MinMark { get; set; }
    public string RawText { get; set; } = "";
    public bool ParsedConfidently { get; set; } = true;
}
