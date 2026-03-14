namespace luke_hacks.Configuration;

public sealed class OpenAiOptions
{
    public string ApiKey { get; set; } = string.Empty;

    public string Model { get; set; } = "gpt-5-mini";
}
