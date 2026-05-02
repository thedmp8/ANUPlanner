namespace ANUPlanner.Models;

public enum IssueSeverity { Error, Warning, ManualReview }

public class ValidationIssue
{
    public IssueSeverity Severity { get; set; }
    public string CourseCode { get; set; } = "";
    public string Message { get; set; } = "";
    public string? Detail { get; set; }
}
