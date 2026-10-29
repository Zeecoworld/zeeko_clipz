# Video factory

Makes original short videos about coding, tech and AI (animated text, code, myth vs fact, A vs B, with generated music),
then schedules them in your Clip Studio app on YouTube and TikTok. It runs on GitHub Actions, so no server is needed.

Every day it:

1. reads what is trending on YouTube (optional, needs `YT_API_KEY`),
2. asks Gemini (free tier) to write the video scripts, then checks every script against strict rules,
3. renders each video with Remotion (720x1280, about 20 to 45 seconds, 30 fps),
4. uploads the MP4 files to Cloudinary,
5. sends them to Clip Studio with their title and description, which puts them in your daily posting slots.

## Set it up

1. **Create a GitHub repository** (private is fine) and push this folder to it.
2. **Add secrets** in the repository under Settings, Secrets and variables, Actions, Secrets:

   | Secret | What it is |
   | --- | --- |
   | `GEMINI_API_KEY` | Free key from Google AI Studio |
   | `YT_API_KEY` | Optional. Free YouTube Data API key, for trend hints |
   | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | The same Cloudinary account Clip Studio uses |
   | `APP_URL` | Your Clip Studio address, for example `https://your-site.netlify.app` |
   | `APP_PASSWORD` | The same `APP_PASSWORD` Clip Studio uses |

3. **Optional settings** under Variables (same page): `VIDEOS_PER_RUN` (default 5), `PLATFORMS` (default `youtube,tiktok`),
   `BRAND` (name shown on the videos), `CTA` (the follow line at the end), `YT_TREND_REGION` (for example `US` or `NG`).
4. **Test run first.** Go to Actions, choose "Daily video factory", Run workflow, set videos to 2 and tick "Only render".
   When it finishes, download the `rendered-videos` file from the run and watch the videos.
5. **Real run.** Run it again with "Only render" unticked. The videos appear under Upcoming in Clip Studio.
   After that it runs by itself every day at 05:00 UTC (change the `cron` line in `.github/workflows/factory.yml`).

## Things to know

- **Nothing here needs changes in Clip Studio.** It uses the importer your app already has.
- **How many videos?** Clip Studio posts as many per day as its slots allow. If the queue runs empty the posts stop, so
  set `VIDEOS_PER_RUN` to at least the posts per day you want (for example 5 for YouTube and 10 for TikTok means 10).
  Each video goes to both platforms.
- **GitHub minutes.** Each video takes a few minutes to render. Private repositories have a monthly free allowance,
  so check GitHub's current limits against your volume.
- **Remotion licence.** Free for for-profit companies with up to 3 people. Larger teams need a company licence.
- **Content rules.** YouTube is strict about repetitive, mass-produced content. Keep the volume reasonable, vary the topics,
  and read the scripts the first few days. The scripts avoid statistics and news on purpose, but an AI can still be wrong.
- **Music** is generated from scratch (`npm run music`), so it is free of copyright claims. To use your own, put
  `track0.wav`, `track1.wav` and `track2.wav` into `public/music` and skip the music step.

## Working on the videos locally

```
npm install
npm run music
npm run studio     # opens Remotion Studio to preview the templates
npm test           # checks the script rules
```

The templates are in `src/templates`. Add a new one by adding a spec type in `src/types.ts`, its timing in
`src/timing.mjs`, its checks in `scripts/lib/spec.mjs` and its description in `scripts/lib/gemini.mjs`.
