# Stage 1: Base runtime environment
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
USER app
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

# Stage 2: Build environment (includes the heavier SDK)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# Copy just the project file first to leverage Docker layer caching
COPY ["luke-hacks.csproj", "./"]
RUN dotnet restore "./luke-hacks.csproj"

# Copy the rest of the code and build
COPY . .
RUN dotnet build "luke-hacks.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Stage 3: Publish the compiled application
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "luke-hacks.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# Stage 4: Final production image
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "luke-hacks.dll"]
