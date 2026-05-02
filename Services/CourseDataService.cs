using ANUPlanner.Models;

namespace ANUPlanner.Services;

public class CourseDataService
{
    private List<CourseOffering> _all = new();
    private bool _loaded = false;
    private readonly IWebHostEnvironment _env;

    public CourseDataService(IWebHostEnvironment env) => _env = env;

    public async Task EnsureLoadedAsync()
    {
        if (_loaded) return;
        var path = Path.Combine(_env.ContentRootPath, "Data", "courses.csv");
        _all = await LoadAsync(path);
        _loaded = true;
    }

    public List<CourseOffering> All => _all;

    public static async Task<List<CourseOffering>> LoadAsync(string path)
    {
        var results = new List<CourseOffering>();
        if (!File.Exists(path)) return results;

        var lines = await File.ReadAllLinesAsync(path);
        if (lines.Length < 2) return results;

        // Parse header
        var header = ParseCsvLine(lines[0]);
        int iCode = IndexOf(header, "course_code");
        int iYear = IndexOf(header, "year");
        int iTitle = IndexOf(header, "title");
        int iCpMin = IndexOf(header, "credit_points_min");
        int iCpMax = IndexOf(header, "credit_points_max");
        int iTerms = IndexOf(header, "terms_offered");
        int iPrereq = IndexOf(header, "prereq_codes");
        int iIncompat = IndexOf(header, "incompatibility_codes");
        int iCareer = IndexOf(header, "academic_career");
        int iMode = IndexOf(header, "mode_of_delivery");
        int iUrl = IndexOf(header, "url");

        for (int i = 1; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrEmpty(line)) continue;
            var f = ParseCsvLine(line);
            if (f.Length <= Math.Max(iCode, iYear)) continue;

            try
            {
                var code = Safe(f, iCode);
                if (string.IsNullOrEmpty(code)) continue;
                if (!int.TryParse(Safe(f, iYear), out int year)) continue;

                var units = 6;
                if (int.TryParse(Safe(f, iCpMin), out int cpMin) && cpMin > 0) units = cpMin;

                var prereqRaw = Safe(f, iPrereq);
                var incompatRaw = Safe(f, iIncompat);

                var offering = new CourseOffering
                {
                    CourseCode = code.ToUpperInvariant(),
                    Year = year,
                    Title = Safe(f, iTitle),
                    Units = units,
                    TermsOffered = Safe(f, iTerms),
                    PrereqRaw = IsNullLike(prereqRaw) ? "" : prereqRaw,
                    IncompatibilityRaw = IsNullLike(incompatRaw) ? "" : incompatRaw,
                    AcademicCareer = Safe(f, iCareer),
                    ModeOfDelivery = Safe(f, iMode),
                    Url = Safe(f, iUrl),
                };

                offering.ParsedTerms = OfferingParserService.Parse(offering.TermsOffered);
                offering.PrereqCodes = SplitPipe(offering.PrereqRaw);
                offering.IncompatibilityCodes = SplitPipe(offering.IncompatibilityRaw);

                results.Add(offering);
            }
            catch
            {
                // Skip malformed rows silently
            }
        }

        return results;
    }

    public CourseOffering? GetOffering(string courseCode, int calendarYear)
    {
        var code = courseCode.ToUpperInvariant();

        // Exact year match
        var exact = _all
            .Where(c => c.CourseCode == code && c.Year == calendarYear)
            .OrderByDescending(c => c.Units)
            .FirstOrDefault();
        if (exact != null) return exact;

        // Future year fallback: use latest available year <= 2027
        var fallback = _all
            .Where(c => c.CourseCode == code)
            .OrderByDescending(c => c.Year)
            .FirstOrDefault();

        return fallback;
    }

    public bool IsFallback(string courseCode, int calendarYear)
    {
        var code = courseCode.ToUpperInvariant();
        return !_all.Any(c => c.CourseCode == code && c.Year == calendarYear)
            && _all.Any(c => c.CourseCode == code);
    }

    public int LatestDataYear => _all.Count > 0 ? _all.Max(c => c.Year) : 2027;

    public List<string> AllSubjectAreas() =>
        _all.Select(c => c.SubjectArea).Distinct().OrderBy(s => s).ToList();

    public List<int> AllYears() =>
        _all.Select(c => c.Year).Distinct().OrderBy(y => y).ToList();

    public List<CourseOffering> GetLatestByCode() =>
        _all.GroupBy(c => c.CourseCode)
            .Select(g => g.OrderByDescending(c => c.Year).First())
            .ToList();

    public List<CourseOffering> Search(string? code, string? title, string? subject,
        int? units, string? term, int? year)
    {
        var q = _all.AsEnumerable();

        // Deduplicate: show latest year per course unless year filter active
        if (year == null)
            q = _all.GroupBy(c => c.CourseCode)
                    .Select(g => g.OrderByDescending(c => c.Year).First());

        if (!string.IsNullOrWhiteSpace(code))
            q = q.Where(c => c.CourseCode.Contains(code.ToUpperInvariant()));
        if (!string.IsNullOrWhiteSpace(title))
            q = q.Where(c => c.Title.Contains(title, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(subject))
            q = q.Where(c => c.SubjectArea.Equals(subject, StringComparison.OrdinalIgnoreCase));
        if (units.HasValue)
            q = q.Where(c => c.Units == units.Value);
        if (!string.IsNullOrWhiteSpace(term))
            q = q.Where(c => c.ParsedTerms.Any(t => t.Equals(term, StringComparison.OrdinalIgnoreCase)));
        if (year.HasValue)
            q = q.Where(c => c.Year == year.Value);

        return q.OrderBy(c => c.CourseCode).ToList();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static string Safe(string[] fields, int idx) =>
        idx >= 0 && idx < fields.Length ? fields[idx].Trim('"', ' ') : "";

    private static int IndexOf(string[] header, string name)
    {
        for (int i = 0; i < header.Length; i++)
            if (header[i].Trim('"', ' ').Equals(name, StringComparison.OrdinalIgnoreCase)) return i;
        return -1;
    }

    private static bool IsNullLike(string s)
    {
        var t = s.Trim().ToUpperInvariant();
        return t is "NA" or "N/A" or "NONE" or "NULL" or "" or "UNKNOWN";
    }

    private static List<string> SplitPipe(string raw) =>
        string.IsNullOrWhiteSpace(raw)
            ? new()
            : raw.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                 .Select(s => s.ToUpperInvariant())
                 .Distinct()
                 .ToList();

    public static string[] ParseCsvLine(string line)
    {
        var fields = new List<string>();
        var current = new System.Text.StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                fields.Add(current.ToString().Trim());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }
        fields.Add(current.ToString().Trim());
        return fields.ToArray();
    }
}
