using System.Text.RegularExpressions;
using ANUPlanner.Models;

namespace ANUPlanner.Services;

public static class PrerequisiteParserService
{
    private static readonly Regex CourseCodeRx = new(@"\b([A-Z]{4}\d{4})\b", RegexOptions.Compiled);
    private static readonly Regex MinMarkRx = new(@"(?:mark\s+of\s+at\s+least|minimum\s+mark\s+of|at\s+least)\s+(\d+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex MinUnitsRx = new(@"(\d+)\s+units?\s+(?:of|from|in)\s+([A-Z]{4})", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex TotalUnitsRx = new(@"completion\s+of\s+(\d+)\s+units", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static PrerequisiteRule Parse(string raw)
    {
        var rule = new PrerequisiteRule { RawText = raw };

        if (string.IsNullOrWhiteSpace(raw) || IsNullLike(raw))
        {
            rule.CourseCodes = new();
            rule.ParsedConfidently = true;
            return rule;
        }

        // Extract all course codes
        var codes = CourseCodeRx.Matches(raw).Select(m => m.Value).Distinct().ToList();
        rule.CourseCodes = codes;

        // Detect mark requirement
        var markMatch = MinMarkRx.Match(raw);
        if (markMatch.Success && int.TryParse(markMatch.Groups[1].Value, out int mark))
        {
            rule.MinMark = mark;
            rule.ParsedConfidently = false; // Can't auto-verify mark
        }

        // Detect units from subject area
        var unitsAreaMatch = MinUnitsRx.Match(raw);
        if (unitsAreaMatch.Success && int.TryParse(unitsAreaMatch.Groups[1].Value, out int areaUnits))
        {
            rule.MinUnits = areaUnits;
            rule.SubjectArea = unitsAreaMatch.Groups[2].Value.ToUpperInvariant();
            rule.ParsedConfidently = false;
        }

        // Detect total units completion
        var totalUnitsMatch = TotalUnitsRx.Match(raw);
        if (totalUnitsMatch.Success && int.TryParse(totalUnitsMatch.Groups[1].Value, out int totalUnits))
        {
            rule.MinUnits = totalUnits;
            rule.ParsedConfidently = false;
        }

        // Determine logic from pipe-separated codes (data uses | as OR separator)
        // If the raw string only contains course codes separated by |, we treat as AnyOf
        var normalised = raw.Trim();
        if (codes.Count > 0 && rule.MinMark == null && rule.MinUnits == null)
        {
            rule.Logic = PrereqLogic.AnyOf;
            rule.ParsedConfidently = true;
        }
        else if (codes.Count == 0 && rule.MinUnits == null)
        {
            // Natural language we couldn't parse
            rule.ParsedConfidently = false;
        }

        return rule;
    }

    private static bool IsNullLike(string s)
    {
        var t = s.Trim().ToUpperInvariant();
        return t is "NA" or "N/A" or "NONE" or "NULL" or "" or "UNKNOWN";
    }
}
