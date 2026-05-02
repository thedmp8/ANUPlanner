namespace ANUPlanner.Models;

public class DegreePlan
{
    public string DegreeId { get; set; } = "";
    public int StartYear { get; set; } = DateTime.Now.Year;
    public int NumberOfYears { get; set; } = 4;
    public List<string> EnabledSemesters { get; set; } = new() { "S1", "S2" };
    public List<PlannedCourse> Courses { get; set; } = new();

    public int CalendarYearFor(int planYear) => StartYear + planYear - 1;

    public IEnumerable<(int PlanYear, string Semester)> AllSlots()
    {
        for (int y = 1; y <= NumberOfYears; y++)
            foreach (var s in EnabledSemesters)
                yield return (y, s);
    }

    public IEnumerable<PlannedCourse> CoursesIn(int planYear, string semester) =>
        Courses.Where(c => c.PlanYear == planYear && c.Semester == semester);

    public IEnumerable<PlannedCourse> CoursesBefore(int planYear, string semester)
    {
        var allSemesters = EnabledSemesters;
        return Courses.Where(c =>
            c.PlanYear < planYear ||
            (c.PlanYear == planYear && allSemesters.IndexOf(c.Semester) < allSemesters.IndexOf(semester)));
    }
}
