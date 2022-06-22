import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import * as emailValidator from 'email-validator';
import * as bcrypt from 'bcrypt';
import songRouter from './routes/songs';
import channelRouter from './routes/channel';
import { init, usersCollection, tokensCollection } from './db';
import { makeid } from './utils';

const port = process.env.PORT || 3000;

const saltRounds: number = 10; // salt rounds for bcrypt hash
const dayMiliSeconds: number = 1000*60*60*24;

const app: Application = express();

app.use(express.json());
app.use("/api", songRouter);
app.use("/api", channelRouter);

app.post('/api/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const user = await usersCollection.findOne({ username });
    if (!user) {
        res.status(401).json({ message: "User does not exist" });
        return;
    }
    if (!password) {
        res.status(401).json({ message: "Password is required" });
        return;
    }
    const result: boolean = await bcrypt.compare(password, user.password);
    if (!result) {
        res.status(401).json({ message: "Incorrect password" });
        return;
    }
    const date: number = Date.now() + dayMiliSeconds;
    let token: string = makeid(64);
    await tokensCollection.insertOne({ username, token, expDate: date });
    res.json({ message: "Login Successful", token });
});

app.post('/api/register', async (req: Request, res: Response) => {
    const { username, password, password2, email } = req.body;
    if (!username || !password || !password2 || !email) {
        res.status(400).json({ message: "All fields are required" });
        return;
    }
    const user = await usersCollection.findOne({ username });
    if (user) {
        res.status(401).json({ message: "User already exists" });
        return;
    }
    if (password !== password2) {
        res.status(400).json('Passwords do not match');
        return;
    }
    if (!emailValidator.validate(email)) {
        res.status(400).json('Invalid email');
        return;
    }
    const emailExists = await usersCollection.findOne({ email });
    if (emailExists) {
        res.status(401).json({ message: "Email already exists" });
        return;
    }
    const date: number = Date.now() + dayMiliSeconds;
    let token: string = makeid(64);
    await tokensCollection.insertOne({ username, token, expDate: date });
    const hash: string = await bcrypt.hash(password, saltRounds); // encrypt password before saving
    await usersCollection.insertOne({ username, password: hash, email, likedSongs: [], viewed: [], playlist: [] });
    res.status(201).json({ message: "User registered successfully.", token });
});

init().then(() => app.listen(port, () => {
    console.log(`Server listening on port ${port}!`);
}));
