using ANUPlanner.Models;

namespace ANUPlanner.Services;

public class DegreeDataService
{
    private List<DegreeRequirement> _degrees = new();
    private bool _loaded = false;
    private readonly IWebHostEnvironment _env;

    public DegreeDataService(IWebHostEnvironment env) => _env = env;

    public async Task EnsureLoadedAsync()
    {
        if (_loaded) return;
        var path = Path.Combine(_env.ContentRootPath, "Data", "degrees.csv");
        _degrees = await LoadAsync(path);
        _loaded = true;
    }

    public List<DegreeRequirement> All => _degrees;

    public DegreeRequirement? Get(string degreeId) =>
        _degrees.FirstOrDefault(d => d.DegreeId.Equals(degreeId, StringComparison.OrdinalIgnoreCase));

    public static async Task<List<DegreeRequirement>> LoadAsync(string path)
    {
        var results = new List<DegreeRequirement>();
        if (!File.Exists(path)) return results;

        var lines = await File.ReadAllLinesAsync(path);
        if (lines.Length < 2) return results;

        var header = CourseDataService.ParseCsvLine(lines[0]);
        int iId = IndexOf(header, "degree_id");
        int iName = IndexOf(header, "degree_name");
        int iUnits = IndexOf(header, "required_units");
        int iCore = IndexOf(header, "core_courses");

        for (int i = 1; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrEmpty(line)) continue;
            var f = CourseDataService.ParseCsvLine(line);

            try
            {
                var id = Safe(f, iId);
                if (string.IsNullOrEmpty(id)) continue;

                var unitsStr = Safe(f, iUnits);
                // Handle "144 units" or just "144"
                var unitsNum = System.Text.RegularExpressions.Regex.Match(unitsStr, @"\d+").Value;
                int.TryParse(unitsNum, out int reqUnits);

                var coreRaw = Safe(f, iCore);
                List<List<string>> groups;
                if (string.IsNullOrWhiteSpace(coreRaw))
                {
                    groups = new List<List<string>>();
                }
                else
                {
                    groups = coreRaw
                        .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Select(segment => segment
                            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                            .Select(s => s.ToUpperInvariant())
                            .Distinct()
                            .ToList())
                        .Where(g => g.Count > 0)
                        .ToList();
                }

                var flatCodes = groups.SelectMany(g => g).Distinct().ToList();

                results.Add(new DegreeRequirement
                {
                    DegreeId = id.ToUpperInvariant(),
                    DegreeName = Safe(f, iName),
                    RequiredUnits = reqUnits,
                    CoreCourseGroups = groups,
                    CoreCourses = flatCodes,
                });
            }
            catch { }
        }

        return results;
    }

    private static string Safe(string[] fields, int idx) =>
        idx >= 0 && idx < fields.Length ? fields[idx].Trim('"', ' ') : "";

    private static int IndexOf(string[] header, string name)
    {
        for (int i = 0; i < header.Length; i++)
            if (header[i].Trim('"', ' ').Equals(name, StringComparison.OrdinalIgnoreCase)) return i;
        return -1;
    }
}
