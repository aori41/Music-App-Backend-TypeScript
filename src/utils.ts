import { Request, Response, NextFunction } from 'express';
import { tokensCollection, usersCollection } from './db';

export function makeid(length: number): string {
    let result: string = '';
    const characters: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) { // get random string
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

export async function validateTokenAndGetUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { token } = req.headers;
    const tokenObj = await tokensCollection.findOne({ token });
    if (!tokenObj) {
        res.status(401).json({ message: "Invalid token" });
        return;
    }
    const date: Date = new Date(Date.now());
    const expDate: Date = new Date(tokenObj.expDate);
    if (date > expDate) { // token expired
        await tokensCollection.deleteOne({ token });
        res.status(400).json({ message: "This token is expired" });
        return;
    }
    const user = await usersCollection.findOne({ username: tokenObj.username });
    if (!user) {
        res.status(401).json({ message: "User does not exist" });
        return;
    }
    res.locals.user = user; // save user to use in other routes
    next();
}