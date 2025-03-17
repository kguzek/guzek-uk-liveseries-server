# The Guzek UK LiveSeries Server

![AGPLv3](https://www.gnu.org/graphics/agplv3-155x51.png)

## Intro

This is a free, open source self-hostable web server written using [Elysia](https://elysiajs.com/) which allows you to automatically download TV shows through [LiveSeries](https://www.guzek.uk/liveseries).
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

> [!TIP]
> Instead of cloning the entire repository, you can just download the `compose.yaml`, `.env.template` and `whitelist.template.json` files. The docker images are hosted on the Docker Hub, meaning you don't need to download the source code to run the application.

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

3. Configure your environment variables. Start by copying `.env.template` to `.env`:

   ```bash
   cp .env{.template,}
   ```

   The fields that you **must** update are:

   - `DATABASE_USER`
   - `DATABASE_PASSWORD`
   - `TR_USER`
   - `TR_PASSWORD`

   If you leave out the rest, the application will work just fine.

4. Configure your server whitelist. If you haven't done so already, register an account at [www.guzek.uk](https://www.guzek.uk/signup), and copy your account UUID from your profile page. Then, copy `whitelist.template.json` into `whitelist.json`:

   ```bash
   cp whitelist{.template,}.json
   ```

   Add your UUID to the array. The UUIDs that are there by default is safe to remove. If you wish to opt-in to automatic torrent downloads by a central CRON job, this file is where you must add the [Cron User UUID](#automatic-unwatched-episodes-checking). Below is what your `whitelist.json` file might look like:

   ```json
    [
      {
        "uuid": "8b1061a9-a170-4b8a-a9bd-af330d83ef71",
        "role": "viewer"
      },
      {
        "uuid": "c17cc350-9be9-453a-ba16-208c5b9be1fe",
        "role": "cron"
      }
    ]
   ```

   Refer to the FAQ for [more information about the whitelist](#3-what-are-the-available-whitelist-settings).

5. Run the application!

   ```bash
   sudo docker compose up -d
   ```

   This will also automatically install the dependencies, PostgreSQL server and Transmission torrent client. The default location for your downloaded files is `/data/transmission/downloads/complete`. You can use the `down` command to stop the application.

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

2. Install the project dependencies, including bun:

   ```bash
   curl -fsSL https://bun.sh/install | bash
   source ~/.bashrc
   cd guzek-uk-liveseries-server
   bun install
   ```

3. Download & install PostgreSQL from <https://www.postgresql.org/download/>.

4. Store the credentials to your database + user in `.env`, following the template in `.env.template`

   ```bash
   cp .env{.template,}
   vi .env
   ```

5. Download & install [Transmission](https://transmissionbt.com/download):

   ```bash
   apt install transmission
   ```

   or:

   ```bash
   dnf install transmission
   ```

6. Create a username and password for the Transmission daemon and also store it in `.env` (Transmission settings.json field `"rpc-password"`):

   ```bash
   systemctl stop transmission-daemon
   vi /etc/transmission-daemon/settings.json
   ```

7. Download & install [ffmpeg](https://ffmpeg.org/download.html), if it isn't installed already:

   ```bash
   ffmpeg -version > /dev/null 2>&1 || apt install ffmpeg
   ```

8. Add `convert-to-mp4.sh` as a torrent-done script for Transmission, so that the `.mkv` videos are streamable through a web browser:

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

9. Optional (for automatic subtitle downloading): create an account at `opensubtitles.com` and [create a developer API consumer](https://www.opensubtitles.com/en/consumers). Then, store your OpenSubtitles API key in `.env` as `SUBTITLES_API_KEY_DEV`; I haven't figured out how to use the production keys yet (ignore the other `SUBTITLES_API_*` fields)
10. Copy `whitelist.template.json` to a new file called `whitelist.json`, and add to it your user UUID. This can be found at your Guzek UK profile -- only registered users listed here will be able to access your server! You can safely remove the UUID that's there by default (my personal account UUID), it's just there to show the format. See [the relevant section below](#automatic-unwatched-episodes-checking) for the opt-in CRON user UUID to add to the whitelist.

    ```bash
    cp whitelist{.template,}.json
    vi whitelist.json
    ```

11. Apply the database schema to your local database using a Prisma migration and generate the client:

    ```bash
    bunx prisma migrate deploy && bun run db:generate
    ```

12. Compile the TypeScript code into an executable:

    ```bash
    bun run build
    ```

13. Run the server:

    ```bash
    ./server
    ```

14. Optional: expose your server to the Internet by port forwarding it in your router settings (expose internal port `5017` to whatever external port you choose)
15. Add the URL of your server to your Guzek UK profile (for same-network access you can use a local address like `http://10.0.0.10:5017` or even `http://localhost:5017` -- requests are all made through the browser)

## FAQ

### #1 How to update the server

Installation via docker compose makes this step very hassle-free. All you have to do is navigate to the location of your `compose.yaml` file and update the images.

```bash
docker compose pull
```

Then, simply re-build the container.

```bash
docker compose up -d --build server
```

That's all!

### #2 How to update the whitelist

The whitelist file is automatically re-read at an interval of 10 minutes. Once you edit it, it will automatically be applied no later than after 10 minutes. If you need it to be applied instantly, you can restart the container since it is additionally always read at server initialisation.

```bash
docker compose down
docker compose up -d
```

You do not need to re-build the container for this.

### #3 What are the available whitelist settings?

There are three permission levels for the whitelist:

- owner -- this gives the user full access to the server, including viewing, streaming, downloading and deleting episodes as well as searching for torrents via `/torrents/`
- viewer -- this only gives access to listing the downloaded files and torrent progress, streaming downloaded episodes and downloading video subtitles, but nothing else
- cron -- this only gives access to downloading new episodes, without viewing, streaming, deleting or anything else
- uploader -- this gives access to both viewer and cron permissions (i.e. streaming & downloading without deleting)

You can have as many users as you like in each category. To give a user a given permission, set their `role` attribute in the `whitelist.json` file to the appropriate permission level.

The default `whitelist.json` file adds a made-up UUID as owner, my personal account as a viewer, and the official CRON user as a cron. A typical installation might involve changing the fake UUID to your UUID, and removing the viewer entry for my account. You can keep the CRON user entry if you wish to enable the [automatic unwatched episodes check](#automatic-unwatched-episodes-checking).

For those interested, the permission rules are hard-coded in the [whitelist middleware file](src/middleware/whitelist.ts#17).
You may notice that the websocket endpoint is listed as public, but the websocket connection in fact requires additional authentication through message frames, allowing only owners or viewers to retrieve information about downloaded episodes and torrent progress.

## Other features

### Automatic unwatched episodes checking

The central Guzek UK API has a CRON job set up to check each user's unwatched episodes every six hours, so there is no recurring task on this self-hosted server. If you wish to use this feature, simply add the official CRON user UUID to your whitelist, too:

```text
c17cc350-9be9-453a-ba16-208c5b9be1fe
```

That way the central server will be able to communicate with your server and download episodes you haven't watched yet.

If there are multiple users using the same LiveSeries server with the same unwatched episodes, the CRON job will send requests for each of them, but only the first one will trigger a new download. Every new download is saved to the database, so subsequent attempts to download the same episode will simply be silently ignored.

### Torrent scraper

This server installation features a customisable torrent scraper, accessible as a REST API.

```bash
curl localhost:5017/torrents/[show-name]/[season]/[episode]
```

Available query parameters:

- sort_by -- one of the fields you wish to sort by, e.g. `seeders`
- sort_direction -- `"asc"` or `"ascending"`, defaults to descending
- select -- `"top_result"`: this returns only the "best" torrent, according to my [selection algorithm](https://github.com/kguzek/guzek-uk-liveseries-server/tree/main/src/torrentIndexers/torrentIndexer.ts#L149). Defaults to returning the whole list of results

Example:

```bash
curl localhost:5017/torrents/[show-name]/[season]/[episode]?sort_by=size&sort_direction=ascending
```

For more information on available routes, refer to the next section.

### Documentation

The Elysia server contains automatic Swagger documentation generation.
Visit the `/swagger` endpoint for a detailed layout of each route along with route parameters, search queries, request bodies and response codes.

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
