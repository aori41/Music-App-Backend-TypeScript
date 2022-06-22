interface Song {
    uploadBy: string;
    title: string;
    artist: string;
    album: string;
    year: number;
    genre: string[];
    duration: number;
    cover?: MM.Picture[];
    songS3Url: string;
    uploadDate: Date;
    likes: number;
}

export {Song};