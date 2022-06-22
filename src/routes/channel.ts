import express, { Request, Response, Router } from 'express';
import * as mm from 'music-metadata';
import multer from 'multer';
import util from 'util';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import { songsCollection } from '../db';
import { deleteFile, uploadFile } from '../s3';
import { validateTokenAndGetUser } from '../utils';
import { Song } from '../models/interface'

const router: Router = express.Router();

const upload: multer.Multer = multer({ dest: 'uploads/' }); // folder to store the files before upload to S3
const unlinkFile = util.promisify(fs.unlink);

router.get('/channel-songs', validateTokenAndGetUser, async (req: Request, res: Response) => { // all the songs the user uploaded
    const user = res.locals.user;
    res.json({ channel: await songsCollection.find({ uploadBy: user.username }).toArray() });
});

router.get('/playlist-songs', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const playlistIds = user.playlist.map((id: ObjectId) => new ObjectId(id));
    res.json({ playlist: await songsCollection.find({ _id: { $in: playlistIds } }).toArray() });
});

router.get('/liked-songs', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const likedSongsIds = user.likedSongs.map((id: ObjectId) => new ObjectId(id));
    res.json({ likedSongs: await songsCollection.find({ _id: { $in: likedSongsIds } }).toArray() });
});

router.get('/watch-history', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const viewedSongsIds = user.viewed.map((id: ObjectId) => new ObjectId(id));
    res.json({ viewed: await songsCollection.find({ _id: { $in: viewedSongsIds } }).toArray() });
});

router.post('/upload', validateTokenAndGetUser, upload.single("file"), async (req: Request, res: Response) => {
    const user = res.locals.user;
    const { title, artist, album, genre, year, duration } = req.body; // not all music files have metadata
    if (!req.file) {
        res.status(400).json({ message: "No file" });
        return;
    }
    const file: Express.Multer.File = req.file;
    const fileExtension = file.originalname.split('.').pop();
    if (!fileExtension?.includes('mp3') && !fileExtension?.includes('m4a')) {
        await unlinkFile(file.path); // delete the file from the server
        res.status(400).json({ message: "Invalid file type" });
        return;
    }
    const metadata = await mm.parseFile(`uploads/${file.filename}`);
    const song: Song = {
        uploadBy: user.username,
        title: title || metadata.common.title,
        artist: artist || metadata.common.artist,
        album: album || metadata.common.album,
        year: year || metadata.common.year,
        genre: genre || metadata.common.genre,
        duration: duration || metadata.format.duration,
        cover: metadata.common.picture,
        songS3Url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${file.filename}`,
        uploadDate: new Date(),
        likes: 0
    }
    const result = await uploadFile(file);
    if (!result) {
        res.status(500).json({ message: "Error uploading file" });
        return;
    }
    const songObj = await songsCollection.insertOne(song);
    await unlinkFile(file.path); // delete the file from the server
    res.json({ songPath: `api/song/${songObj.insertedId}` });
});

router.delete('/delete/:id', validateTokenAndGetUser, async (req: Request, res: Response) => {
    const user = res.locals.user;
    const songId = req.params.id;
    if (!ObjectId.isValid(songId)) {
        res.status(400).json({ message: "Invalid song id" });
        return;
    }
    const song = await songsCollection.findOne({ _id: new ObjectId(songId) });
    if (!song) {
        res.status(400).json({ message: "Song does not exist" });
        return;
    }
    if (song.uploadBy !== user.username) {
        res.status(401).json({ message: "User is not authorized to delete this song" });
        return;
    }
    // delete the file from s3 and from the database
    await deleteFile(song.songS3Url);
    await songsCollection.deleteOne({ _id: new ObjectId(songId) });
    res.json({ message: "Song deleted" });
});

export default router;
