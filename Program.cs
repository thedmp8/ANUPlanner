using ANUPlanner.Components;
using ANUPlanner.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Planner services
builder.Services.AddSingleton<CourseDataService>();
builder.Services.AddSingleton<DegreeDataService>();
builder.Services.AddScoped<PlanStateService>();
builder.Services.AddScoped<PlannerValidationService>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}

app.UseStaticFiles();
app.UseAntiforgery();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
