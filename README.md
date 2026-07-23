# F1 - ALMANAC
F1 Almanac — an interactive dashboard with historical Formula 1 data and an AI assistant.

## Overview

The project allows users to explore Formula 1 history through four main analytical sections:

- **Seasons** — championship standings, points, podiums, Grand Prix results, and season progression.
- **Drivers** — career timelines, teams, teammate battles, circuit performance, and driver profiles.
- **Constructors** — team history, championships, wins, top drivers, and performance across seasons.
- **Circuits** — circuit maps, corner names, records, winners by year, and the most successful drivers and constructors.

## Ask the Almanac

The built-in AI assistant allows users to ask Formula 1 questions in natural language.

The assistant:

1. interprets the user's question;
2. selects the relevant analytical context;
3. generates an SQL query;
4. executes the query against the Formula 1 data warehouse;
5. transforms the query result into a readable answer.

Generated SQL can also be inspected by the user, making the analytical process more transparent.

## Technical Architecture

The application is built as a full-stack Next.js project.

### Frontend

- **Next.js 16**
- **React**
- **TypeScript**
- **Tailwind CSS**
- Client-side state management with React hooks
- Responsive dashboard layouts
- Custom SVG-based circuit visualizations
- Interactive selectors, tooltips, timelines, heatmaps, and comparison panels
- Animated transitions between selected entities and dashboard states

### Backend

- Next.js API routes handle server-side requests
- API endpoints retrieve and prepare Formula 1 data for the frontend
- Server-side integration with Google BigQuery
- Separate API route for the AI assistant
- Environment variables are used for credentials and model configuration

### Data Layer

- **Google BigQuery** is used as the analytical data warehouse
- Historical Formula 1 data is structured for querying by:
  - seasons;
  - races;
  - drivers;
  - constructors;
  - circuits;
  - standings;
  - results;
  - lap and performance statistics.
- SQL queries power the dashboard metrics and visualizations

### AI Layer

- **Anthropic Claude API**
- Natural-language question interpretation
- Dynamic SQL generation
- Tool-based access to Formula 1 datasets
- SQL validation and controlled query execution
- Result summarization into user-friendly answers
- Generated SQL transparency inside the interface

### Deployment and Infrastructure

- **GitHub** for source control and version history
- **Vercel** for hosting and continuous deployment
- Production deployments are triggered automatically from the `main` branch
- Vercel Environment Variables are used for:
  - `ANTHROPIC_API_KEY`;
  - AI model configuration;
  - database credentials and server-side configuration.

## Main Features

- Historical Formula 1 analytics
- Season, driver, constructor, and circuit dashboards
- Custom circuit maps with named corners
- Driver and constructor career timelines
- Teammate performance comparisons
- Circuit mastery and performance profiles
- Interactive historical rankings
- AI-powered natural-language analytics
- Dynamically generated SQL queries
- Inspectable SQL behind AI answers
- Responsive dark glass-style interface
- Automatic deployment through GitHub and Vercel

## Tech Stack

| Area | Technologies |
|---|---|
| Application | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Data warehouse | Google BigQuery |
| AI | Anthropic Claude API |
| Visualizations | React, SVG, custom chart components |
| Source control | GitHub |
| Deployment | Vercel |

## Project Structure

```text
frontend/
├── app/
│   ├── api/              # Server-side API routes
│   ├── seasons/          # Season analytics page
│   ├── drivers/          # Driver analytics page
│   ├── constructors/     # Constructor analytics page
│   ├── circuits/         # Circuit analytics page
│   └── credits/          # Project credits
├── components/           # Reusable UI and visualization components
├── lib/                  # Data access, utilities, and shared logic
└── public/               # Images, circuit SVGs, and static assets
```text
