# Guzek UK LiveSeries Server

## Intro

This is a free, open source self-hostable Express.js server which allows you to automatically download TV shows through [LiveSeries](https://www.guzek.uk/liveseries).
Once you get it up and running on your machine, all you need to do is visit [www.guzek.uk](https://www.guzek.uk), create an account, and enter your LiveSeries server's URL in the appropriate box in your profile.
Then, simply navigate to [/liveseries](https://www.guzek.uk/liveseries), select a couple shows to watch -- and watch the magic happen!

You can choose to subscribe to automatic downloads, or manually select episodes to be downloaded from the list.
WARNING! The subscription option tries to download every single episode you haven't watched that has released so far from your liked TV shows; use it for shows you're more-or-less up to date on, or if you have a large enough disk.

## Installation

### Installer

`[WIP]` I'm working on an installer (or npx command?) which will automatically do most of the setup.

### Manual installation

The manual installation involves quite a few steps, but the process is pretty straightforward.

1. Clone this repository:
```bash
git clone --depth 1 git@github.com:kguzek/guzek-uk-liveseries-server
```
2. Install the project dependencies:
```bash
cd guzek-uk-liveseries-server
npm install
```
3. Download & install MySQL or MariaDB (either is fine, I recommend MariaDB):
```bash
curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo bash
```
4. Change the credentials in `scripts/create_user.sql`, then run the SQL scripts provided in `scripts`, in the order specified in `scripts/README.md`:
```bash
vi scripts/create_user.sql
mysql -u [username] -p
mysql> source scripts/create_schema.sql
mysql> source scripts/create_user.sql
```
5. Store the credentials to your database + user in `.env`, following the template in `template.env`
```bash
cp {template,}.env
vi .env
```
6. Download & install [Transmission](https://transmissionbt.com/download):
```bash
apt install transmission
``` 
or:
```bash
dnf install transmission
```
7. Create a username and password for the Transmission daemon and also store it in `.env` (Transmission settings.json field `"rpc-password"`):
```bash
systemctl stop transmission-daemon
vi /etc/transmission-daemon/settings.json
```
8. Download & install [ffmpeg](https://ffmpeg.org/download.html), if it isn't installed already:
```
ffmpeg -version > /dev/null 2>&1 || apt install ffmpeg
```
9. Add `convert-to-mp4.sh` as a torrent-done script for Transmission, so that the `.mkv` videos are streamable through a web browser:
```json
{
  "script-torrent-done-enabled": true
  "script-torrent-done-filename": "/path/to/project/convert-to-mp4.sh"
}
```
You can also modify the conversion script to suit your needs.

Remember to start the torrent service back up again:
```bash
systemctl start transmission-daemon
```
10. Optional (for automatic subtitle downloading): create an account at `opensubtitles.com` and [create a developer API consumer](https://www.opensubtitles.com/en/consumers). Then, store your OpenSubtitles API key in `.env` as `SUBTITLES_API_KEY_DEV`; I haven't figured out how to use the production keys yet (ignore the other `SUBTITLES_API_*` fields)
11. Transpile the TypeScript code into JavaScript: 
```bash
npm run compile
```
12. Optional: remove the [`--max-old-space-size=192`](https://stackoverflow.com/questions/48387040/how-do-i-determine-the-correct-max-old-space-size-for-node-js) from `package.json` (for better performance)
13. Add your user UUID to `whitelist.json`, which can be found at your Guzek UK profile -- only registered users listed here will be able to access your server! You can safely remove the UUID that's there by default (my personal account UUID), it's just there to show the format.
14. Run the server:
```bash
npm run prod
```
15. Optional: expose your server to the Internet by port forwarding it in your router settings (expose internal port `5021` to whatever external port you choose)
16. Add the URL of your server to your Guzek UK profile (for same-network access you can use a local address like `http://10.0.0.10:5021` or even `http://localhost:5021` -- requests are all made through the browser)

## Other features

## Automatic unwatched episodes checking

The central Guzek UK API has a CRON job set up to check each user's unwatched episodes every six hours, so there is no recurring task on this self-hosted server. If you wish to use this feature, simply add the administrator user UUID to your whitelist, too:
```
a5260d6a-7275-4d86-bcd7-fd5372827ff5
```
That way the central server will be able to communicate with your server and download episodes you haven't watched yet.

### Torrent scraper

This server installation features a customisable torrent scraper, accessible as a REST API.
```
curl localhost:5021/liveseries/torrents/[show-name]/[season]/[episode]
```
Available query parameters:
- sort_by -- one of the fields you wish to sort by, e.g. `seeders`
- sort_direction -- `"asc"` or `"ascending"`, defaults to descending
- select -- `"top_result"`: this returns only the "best" torrent, according to an [arbitrary algorithm](https://github.com/kguzek/guzek-uk-liveseries-server/tree/main/src/torrentIndexers/torrentIndexer.ts#L130). Defaults to returning the whole list of results

Example:
```
curl localhost:5021/liveseries/torrents/[show-name]/[season]/[episode]?sort_by=size&sort_direction=ascending
```

## That's all

Thanks for reading! Feel free to reach out if you have questions or want to contribute.
