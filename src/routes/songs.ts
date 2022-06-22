import express, { Request, Response, Router } from 'express';
import { ObjectId } from 'mongodb';
import { songsCollection, usersCollection } from '../db';
import { validateTokenAndGetUser } from '../utils';
import { getFile } from '../s3';

const router: Router = express.Router();

router.get('/songs', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const { input } = req.query;
    if (input && typeof input === "string") { // search by input
        res.json(await searchByKeyWords(input));
        return;
    }
    if (user.viewed.length === 0) { // most liked songs
        res.json({ songs: await songsCollection.find({}).sort({ likes: -1 }).toArray() });
        return;
    }
    const matched: any[] = [];
    const viewed = user.viewed >= 5 ? 5 : user.viewed.length;
    for (let i = 0; i < viewed; i++) { // 5 last viewed songs to get user's favorite songs
        const song = await songsCollection.findOne({ _id: new ObjectId(user.viewed[user.viewed.length - i - 1]) });
        if (song) matched.push(song);
    }
    let artists: string = "";
    let genres: string = "";
    for (let i = 0; i < matched.length; i++) { // get the artists and genres the user likes
        if(!artists.includes(matched[i].artist)) artists = artists + matched[i].artist + " ";
        let genre = matched[i].genre;
        genre.forEach((g: string) => {
            if(!genres.includes(g)) genres = genres + g + " ";
        });
    }
    const matches: any[] = [];
    const songs = await songsCollection.find({}).toArray();
    for (let i = 0; i < songs.length; i++) {
        let inList: boolean = matched.map(m => JSON.stringify(m)).includes(JSON.stringify(songs[i]));
        let match: number = 0;
        if(inList) match += 10; // last viewed songs goes to the top of the list
        let songSplit: string[] = songs[i].artist.split(" ");
        for (let g = 0; g < songSplit.length; g++) {
            let artist: string[] = artists.split(" ");
            for (let h = 0; h < artist.length; h++) {
                const similar: number = similarPercent(songSplit[g], artist[h]); // find similarity in names for more spelling mistakes
                if (similar > 50) {
                    match += 2; // put artist matches higher in the list
                }
            }
        }
        songSplit = songs[i].genre; // same for genres
        for (let g = 0; g < songSplit.length; g++) {
            const genre: string[] = genres.split(" ");
            for (let h = 0; h < genre.length; h++) {
                const similar: number = similarPercent(songSplit[g], genre[h]);
                if (similar > 50) {
                    match++;
                }
            }
        }
        if (match > 0) {
            let index: number = 0;
            while (index < matches.length && matches[index][0] > match) { // find the index to insert the match
                index++;
            }
            matches.splice(index, 0, [match, songs[i]]); // sort by relevance
        }
    }
    res.json({ songs: matches.map(match => match[1]) });
});

router.get('/song/:id', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const songId: string = req.params.id;
    if (!ObjectId.isValid(songId)) {
        res.status(400).json({ message: "Invalid song id" });
        return;
    }
    const song = await songsCollection.findOne({ _id: new ObjectId(songId) });
    if (!song) {
        res.status(400).json({ message: "Song does not exist" });
        return;
    }
    let viewed: string[] = user.viewed;
    viewed.push(songId);
    await usersCollection.updateOne({ username: user.username }, { $set: { viewed } });
    const fileName = song.songS3Url.split('/')[3];
    const file = getFile(fileName);
    file.pipe(res); // return the song from S3 to user
});

router.post('/add-to-playlist/:id', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const songId: string = req.params.id;
    if (!ObjectId.isValid(songId)) {
        res.status(400).json({ message: "Invalid song id" });
        return;
    }
    const song = await songsCollection.findOne({ _id: new ObjectId(songId) });
    if (!song) {
        res.status(400).json({ message: "Song does not exist" });
        return;
    }
    let playlist: string[] = user.playlist;
    if (playlist.includes(songId)) {
        res.status(400).json({ message: "Song already in playlist" });
        return;
    }
    playlist.push(songId);
    await usersCollection.updateOne({ username: user.username }, { $set: { playlist } });
    res.json({ message: "Song added to playlist" });
});

router.post('/remove-from-playlist/:id', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const songId: string = req.params.id;
    if (!ObjectId.isValid(songId)) {
        res.status(400).json({ message: "Invalid song id" });
        return;
    }
    const song = await songsCollection.findOne({ _id: new ObjectId(songId) });
    if (!song) {
        res.status(400).json({ message: "Song does not exist" });
        return;
    }
    let playlist: string[] = user.playlist;
    if (!playlist.includes(songId)) {
        res.status(400).json({ message: "Song is not in playlist" });
        return;
    }
    playlist.splice(playlist.indexOf(songId), 1); // remove song from playlist and update database
    await usersCollection.updateOne({ username: user.username }, { $set: { playlist } });
    res.json({ message: "Song removed from playlist" });
});

router.post('/like/:id', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const songId: string = req.params.id;
    if (!ObjectId.isValid(songId)) {
        res.status(400).json({ message: "Invalid song id" });
        return;
    }
    const song = await songsCollection.findOne({ _id: new ObjectId(songId) });
    if (!song) {
        res.status(400).json({ message: "Song not found" });
        return;
    }
    const likedSongs: string[] = user.likedSongs;
    if (likedSongs.includes(songId)) { // if song is already liked
        const index: number = likedSongs.indexOf(songId);
        likedSongs.splice(index, 1);
        await usersCollection.updateOne({ username: user.username }, { $set: { likedSongs } });
        await songsCollection.updateOne({ _id: new ObjectId(songId) }, { $inc: { likes: -1 } });
        res.json({ message: "Song unliked" });
        return;
    }
    likedSongs.push(songId);
    await usersCollection.updateOne({ username: user.username }, { $set: { likedSongs } });
    await songsCollection.updateOne({ _id: new ObjectId(songId) }, { $inc: { likes: 1 } });
    res.json({ message: "Song liked" });
});

async function searchByKeyWords(input: string): Promise<any> { // search options
    const songs = await songsCollection.find({}).toArray();
    const keyWords: string[] = input.split(" ");
    const matches: any[] = [];
    for (let i = 0; i < songs.length; i++) {
        let match: number = 0;
        for (let g = 0; g < keyWords.length; g++) { // search the keywords in song titles
            const sTitle: string = songs[i].title.split(" ");
            for (let h = 0; h < sTitle.length; h++) {
                const similar: number = similarPercent(keyWords[g], sTitle[h]);
                if (similar > 50) {
                    match++;
                }
            }
            if (match < 1) { // search artists with the key words
                const sArtist: string = songs[i].artist.split(" ");
                for (let h = 0; h < sArtist.length; h++) {
                    const similar: number = similarPercent(keyWords[g], sArtist[h]);
                    if (similar > 50) {
                        match++;
                    }
                }
            }
        }
        if (match > 0) {
            let index: number = 0;
            while (index < matches.length && matches[index][0] > match) { // find the index to insert the match
                index++;
            }
            matches.splice(index, 0, [match, songs[i]]); // sort by relevance
        }
    }
    return matches.map(match => match[1]);
}

function similarPercent(str1: string, str2: string): number {
    let similar: number = 0;
    const minLength: number = (str1.length > str2.length) ? str2.length : str1.length;
    const maxLength: number = (str1.length < str2.length) ? str2.length : str1.length;
    for (let i = 0; i < minLength; i++) { // compare each letter
        if (str1[i].toLowerCase() == str2[i].toLowerCase()) similar++;
    }
    return (similar / maxLength) * 100; // returns similarity percantage
}

export default router;
