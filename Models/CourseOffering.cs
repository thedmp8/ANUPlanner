namespace ANUPlanner.Models;

public class CourseOffering
{
    public string CourseCode { get; set; } = "";
    public int Year { get; set; }
    public string Title { get; set; } = "";
    public int Units { get; set; } = 6;
    public string TermsOffered { get; set; } = "";
    public List<string> ParsedTerms { get; set; } = new();
    public string PrereqRaw { get; set; } = "";
    public string IncompatibilityRaw { get; set; } = "";
    public List<string> PrereqCodes { get; set; } = new();
    public List<string> IncompatibilityCodes { get; set; } = new();
    public string AcademicCareer { get; set; } = "";
    public string ModeOfDelivery { get; set; } = "";
    public string Url { get; set; } = "";

    public string SubjectArea => CourseCode.Length >= 4
        ? CourseCode[..4]
        : CourseCode;
}
