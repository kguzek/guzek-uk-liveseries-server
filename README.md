# Guzek UK LiveSeries Server

## Intro

This is a self-hostable Node.js Express server which allows you to automatically download TV shows through [LiveSeries](https://www.guzek.uk/liveseries).
Once you get it up and running on your machine, all you need to do is visit [www.guzek.uk](https://www.guzek.uk), create an account, and enter your LiveSeries server's URL in the appropriate box in your profile.
Then, simply navigate to [/liveseries](https://www.guzek.uk/liveseries), select a couple shows to watch -- and that's all!

You can choose to subscribe to automatic downloads, or manually select episodes to be downloaded from the list.
WARNING! The subscription option tries to download every single episode you haven't watched that has released so far from your liked TV shows; use it for shows you're up to date on, or if you have a large enough disk.

## Installation

[WIP] I'm working on an installer (or npx command?) which will automatically do most of the setup.

If you want to do it manually, here are the steps:
1. Clone this repository
2. Download & install MySQL or MariaDB (either is fine, I recommend MariaDB)
3. Run the SQL scripts provided in `scripts`, in the order specified in `scripts/README.md`
4. Store the credentials to your database + user in `.env`, following the template in `template.env`
5. Download & install [Transmission](https://transmissionbt.com/download)
6. Create a username and password for the Transmission daemon and also store it in `.env` (Transmission settings.json field `"rpc-password"`)
7. Add `convert-to-mp4.sh` as a torrent-done script for Transmission, so that the `.mkv` videos are streamable through a web browser (Transmission settings.json fields `"script-torrent-done-enabled": true` and `"script-torrent-done-filename": "/path/to/convert-to-mp4.sh"`)
8. Optional (for automatic subtitle downloading): create an account at `opensubtitles.com` and [create a developer API consumer](https://www.opensubtitles.com/en/consumers)
9. ... Store your OpenSubtitles API key in `.env` as `SUBTITLES_API_KEY_DEV`, I haven't figured out how to use the production keys yet (ignore the other `SUBTITLES_API_*` fields)
10. Install the project dependencies: `npm install`
11. Transpile the TypeScript code into JavaScript: `npm run compile`
12. Optional: remove the [`--max-old-space-size=192`](https://stackoverflow.com/questions/48387040/how-do-i-determine-the-correct-max-old-space-size-for-node-js) from `package.json` (for more performance)
13. Run the server: `npm run prod`
14. Optional: expose your server to the Internet by port forwarding it in your router settings (expose internal port 5021 to whatever external port you choose)
15. Add the URL of your server to your Guzek UK profile (for running on the same machine you can use an address like `http://10.0.0.10:5021`)
16. Add your user UUID to `whitelist.json`, which can be found at your Guzek UK profile -- nobody else will be able to access your server!

## Usage

The central Guzek UK API has a CRON job set up to check each user's unwatched episodes every six hours, so there is no recurring task on this self-hosted server. If you wish to use this feature, simply add the administrator user UUID to your whitelist, too:
```
a5260d6a-7275-4d86-bcd7-fd5372827ff5
```
