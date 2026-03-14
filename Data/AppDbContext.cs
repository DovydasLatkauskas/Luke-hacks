using luke_hacks.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace luke_hacks.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<CollaborativePlanningChat> CollaborativePlanningChats => Set<CollaborativePlanningChat>();

    public DbSet<CollaborativePlanningParticipant> CollaborativePlanningParticipants => Set<CollaborativePlanningParticipant>();

    public DbSet<CollaborativePlanningEvent> CollaborativePlanningEvents => Set<CollaborativePlanningEvent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<CollaborativePlanningChat>()
            .HasIndex(chat => chat.InviteToken)
            .IsUnique();

        builder.Entity<CollaborativePlanningParticipant>()
            .HasIndex(participant => new { participant.ChatId, participant.UserId })
            .IsUnique();

        builder.Entity<CollaborativePlanningParticipant>()
            .HasOne(participant => participant.Chat)
            .WithMany(chat => chat.Participants)
            .HasForeignKey(participant => participant.ChatId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<CollaborativePlanningEvent>()
            .HasIndex(evt => new { evt.ChatId, evt.Id });
    }
}
