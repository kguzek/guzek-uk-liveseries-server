# The Guzek UK LiveSeries Server

![AGPLv3](https://www.gnu.org/graphics/agplv3-155x51.png)

## Intro

This is a free, open source self-hostable Express.js server which allows you to automatically download TV shows through [LiveSeries](https://www.guzek.uk/liveseries).
Once you get it up and running on your machine, all you need to do is visit [www.guzek.uk](https://www.guzek.uk), create an account, and enter your LiveSeries server's URL in the appropriate box in your profile.
Then, simply navigate to [/liveseries](https://www.guzek.uk/liveseries), select a couple shows to watch -- and watch the magic happen!

You can choose to subscribe to automatic downloads, or manually select episodes to be downloaded from the list.

> [!WARNING]
> The subscription option tries to download every single episode you haven't watched that has released so far from your liked TV shows; use it for shows you're more-or-less up to date on, or if you have a large enough disk.

## Installation

> [!CAUTION]
> Please ensure that downloading torrents is legal in your country before installing this program. Refer to the [copyright section](#copyright) at the bottom of this page or the [LICENSE](LICENSE) file included in this repository, specifically [§15](LICENSE#L587) and [§16](LICENSE#L598).

### Docker Compose

The recommended way to use the Guzek UK LiveSeries Server is to use Docker Compose.

1. Ensure you have Docker Compose installed on your system. The Docker website contains [very informative documentation](https://docs.docker.com/compose/install/) on how to do this, if you haven't already. You can check if it's installed via the terminal:

   ```bash
   docker compose version
   ```

2. Clone this repository:

   ```bash
   git clone --depth 1 https://github.com/kguzek/guzek-uk-liveseries-server
   ```

   Then, enter the newly-created project directory:

   ```bash
   cd guzek-uk-liveseries-server
   ```

3. Configure your environment variables. Start by copying `template.env` to `.env`:

   ```bash
   cp {template,}.env
   ```

   The fields that you **must** update are:

   - `MY_SQL_DB_USER`
   - `MY_SQL_DB_PASSWORD`
   - `TR_USER`
   - `TR_PASSWORD`

   For best security, it is a good decision to set `MARIADB_ROOT_PASSWORD`. This isn't used by the application, but it allows you to access the data manually using the root account in case something goes wrong.

   If you leave out the rest, the application will work just fine.

   IMPORTANT: If you modify `MY_SQL_DB_NAME`, make sure to update `/scripts/create_schema.sql` to reflect this change. By default, this script assumes your database is named `liveseries`. The other scripts are not used when installing via docker compose, so you can ignore them.

4. Configure your server whitelist. If you haven't done so already, register an account at [www.guzek.uk](https://www.guzek.uk/signup), and copy your account UUID from your profile page. Then, copy `whitelist.template.json` into `whitelist.json`:

   ```bash
   cp whitelist{.template,}.json
   ```

   Add your UUID to the array. The UUID that is there by default is safe to remove. If you wish to opt-in to automatic torrent downloads by a central CRON job, this file is where you must add the [Cron User UUID](#automatic-unwatched-episodes-checking). Below is what your `whitelist.json` file might look like:

   ```json
   [
     "55d914eb-6cfb-4ddf-bc08-443d64191cfc",
     "a5260d6a-7275-4d86-bcd7-fd5372827ff5"
   ]
   ```

5. Run the application!

   ```bash
   sudo docker compose up -d
   ```

   This will also automatically install the dependencies, MariaDB server and Transmission torrent client. The default location for your downloaded files is `/data/transmission/downloads/complete`. You can use the `down` command to stop the application.

   ```bash
   sudo docker compose down
   ```

   Note: if you have the Docker daemon set to start automatically on boot, this application will start with it. Using `down` will **not** disable this behaviour.

### Manual installation

The manual installation involves more steps than the docker compose method, but the process itself is rather straightforward.

1. Clone this repository:

   ```bash
   git clone --depth 1 https://github.com/kguzek/guzek-uk-liveseries-server
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

   ```bash
   ffmpeg -version > /dev/null 2>&1 || apt install ffmpeg
   ```

9. Add `convert-to-mp4.sh` as a torrent-done script for Transmission, so that the `.mkv` videos are streamable through a web browser:

   ```json
   {
     "script-torrent-done-enabled": true
     "script-torrent-done-filename": "/path/to/project/convert-to-mp4.sh"
   }
   ```

   Tip: You can also modify the conversion script to suit your needs.

   Remember to start the torrent service back up again:

   ```bash
   systemctl start transmission-daemon
   ```

10. Optional (for automatic subtitle downloading): create an account at `opensubtitles.com` and [create a developer API consumer](https://www.opensubtitles.com/en/consumers). Then, store your OpenSubtitles API key in `.env` as `SUBTITLES_API_KEY_DEV`; I haven't figured out how to use the production keys yet (ignore the other `SUBTITLES_API_*` fields)
11. Copy `whitelist.template.json` to a new file called `whitelist.json`, and add to it your user UUID. This can be found at your Guzek UK profile -- only registered users listed here will be able to access your server! You can safely remove the UUID that's there by default (my personal account UUID), it's just there to show the format. See [the relevant section below](#automatic-unwatched-episodes-checking) for the opt-in CRON user UUID to add to the whitelist.

    ```bash
    cp whitelist{.template,}.json
    vi whitelist.json
    ```

12. Transpile the TypeScript code into JavaScript:

    ```bash
    npm run compile
    ```

13. Run the server:

    ```bash
    npm run prod
    ```

14. Optional: expose your server to the Internet by port forwarding it in your router settings (expose internal port `5021` to whatever external port you choose)
15. Add the URL of your server to your Guzek UK profile (for same-network access you can use a local address like `http://10.0.0.10:5021` or even `http://localhost:5021` -- requests are all made through the browser)

## FAQ

### #1 How to update the server

If the code on [github.com](https://github.com/kguzek/guzek-uk-liveseries-server) was updated since you first installed this program, you may need to update it for critical security fixes as well as new features and bug fixes.
In order to update your installation, you will first need to navigate to the location to which you cloned the repository and pull the origin.

```bash
cd guzek-uk-liveseries-server
git pull
```

Then, assuming you installed via docker compose, all you have to do is re-build the `server` container. This works even if the container is currently running!

```bash
sudo docker compose up -d --build server
```

### #2 How to update the whitelist

The steps to updating the whitelist are almost the same as updating the server. Instead of running `git pull`, simply edit the `whitelist.json`, and then re-build the server using the same command as above.

## Other features

### Automatic unwatched episodes checking

The central Guzek UK API has a CRON job set up to check each user's unwatched episodes every six hours, so there is no recurring task on this self-hosted server. If you wish to use this feature, simply add the CRON user UUID to your whitelist, too:

```text
a5260d6a-7275-4d86-bcd7-fd5372827ff5
```

That way the central server will be able to communicate with your server and download episodes you haven't watched yet.

### Torrent scraper

This server installation features a customisable torrent scraper, accessible as a REST API.

```bash
curl localhost:5021/liveseries/torrents/[show-name]/[season]/[episode]
```

Available query parameters:

- sort_by -- one of the fields you wish to sort by, e.g. `seeders`
- sort_direction -- `"asc"` or `"ascending"`, defaults to descending
- select -- `"top_result"`: this returns only the "best" torrent, according to my [selection algorithm](https://github.com/kguzek/guzek-uk-liveseries-server/tree/main/src/torrentIndexers/torrentIndexer.ts#L149). Defaults to returning the whole list of results

Example:

```bash
curl localhost:5021/liveseries/torrents/[show-name]/[season]/[episode]?sort_by=size&sort_direction=ascending
```

## Copyright

Copyright © 2024-2025 by Konrad Guzek

This file is part of the Guzek UK LiveSeries Server.

The Guzek UK LiveSeries Server is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

The Guzek UK LiveSeries Server is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

## That's all

Thanks for reading! Feel free to reach out if you have questions or want to contribute.
