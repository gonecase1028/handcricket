# Hand Cricket

A free two-team cricket game for 2 to 12 players. One person hosts on a laptop or TV, everyone else plays from their own phone with a room code. No packages and no accounts for players. Sounds, animations and confetti all run in the browser, so the server stays light.

## Put it online with Render (free)

Use a NEW GitHub repository for this game.

1. On github.com create a new repository, for example `hand-cricket`.
2. Upload `hand-cricket.js`, `package.json` and `README.md` (Add file, then Upload files, then Commit changes).
3. On render.com choose New, then Web Service, and pick the repository.
4. Language: `Node`. Build Command: `npm install`. Start Command: `npm start`. Instance type: Free.
5. When it is live you get an address ending in `.onrender.com`.

## Play

- Host: open `YOUR-ADDRESS/host` (or tap Host a game on the home page). You see the room code, the match settings and the player list.
- Players: open `YOUR-ADDRESS` on their phones, type the room code and a name, then pick a team. You can also share the invite link from the host screen.
- The host can set overs, seconds per ball and team names, lock the room, move or remove players, pick captains, and start the match.
- Close room ends the game for everyone. The room also closes by itself about 30 seconds after the host closes the page.
- The Rules tab explains how to play. The speaker button turns sound on or off.

## Rules in short

1. Toss: one captain calls odd or even. Both captains pick 0 to 10. If the total matches the call, the calling team wins the toss and bats first.
2. Captains set the batting order and the bowling order.
3. Each ball: batter and bowler each pick 0 to 10 in time (no pick counts as 0). Same number is OUT. Different numbers: the batter's number is added. If the batter plays 0 and the bowler plays more than 0, the bowler's number is added.
4. An over is 6 balls. The second team chases the target (first score plus 1). Equal scores are a tie.

Free hosting sleeps after 15 minutes without use and takes about a minute to wake up. Open the address a minute or two before the game.
