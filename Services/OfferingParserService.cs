namespace ANUPlanner.Services;

public static class OfferingParserService
{
    public static readonly string[] KnownTerms = { "S1", "S2", "SUMMER", "WINTER", "AUTUMN", "SPRING" };

    public static List<string> Parse(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || IsNullLike(raw))
            return new List<string>();

        var result = new List<string>();
        var parts = raw.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var part in parts)
        {
            var normalised = Normalise(part);
            if (!string.IsNullOrEmpty(normalised))
                result.Add(normalised);
        }
        return result;
    }

    private static string Normalise(string term)
    {
        var t = term.Trim().ToUpperInvariant();
        return t switch
        {
            "S1" or "SEM1" or "SEMESTER1" or "SEMESTER 1" or "FIRST SEMESTER" or "1" => "S1",
            "S2" or "SEM2" or "SEMESTER2" or "SEMESTER 2" or "SECOND SEMESTER" or "2" => "S2",
            "SUMMER" or "SUMMER SESSION" or "SUM" => "SUMMER",
            "WINTER" or "WINTER SESSION" or "WIN" => "WINTER",
            "AUTUMN" or "AUTUMN SESSION" or "AUT" => "AUTUMN",
            "SPRING" or "SPRING SESSION" or "SPR" => "SPRING",
            "UNKNOWN" or "TBA" or "N/A" or "NA" or "NOT OFFERED" => "",
            _ => t
        };
    }

    public static bool IsOfferedIn(List<string> terms, string semester) =>
        terms.Any(t => string.Equals(t, semester, StringComparison.OrdinalIgnoreCase));

    public static bool IsAmbiguous(string raw) =>
        !string.IsNullOrWhiteSpace(raw) && !IsNullLike(raw) && Parse(raw).Count == 0;

    private static bool IsNullLike(string s)
    {
        var t = s.Trim().ToUpperInvariant();
        return t is "NA" or "N/A" or "NONE" or "NULL" or "" or "UNKNOWN" or "NOT OFFERED" or "TBA";
    }

    public static string DisplayLabel(string term) => term switch
    {
        "S1" => "Semester 1",
        "S2" => "Semester 2",
        "SUMMER" => "Summer",
        "WINTER" => "Winter",
        "AUTUMN" => "Autumn",
        "SPRING" => "Spring",
        _ => term
    };
}
