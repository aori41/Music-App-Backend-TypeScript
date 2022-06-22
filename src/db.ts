import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.DATA_BASE || "");

// exported collections
export const usersCollection = client.db("music").collection("users");
export const tokensCollection = client.db("music").collection("tokens");
export const songsCollection = client.db("music").collection("songs");

export async function init() {
    await client.connect();
    console.log("Connected to MongoDB");
}