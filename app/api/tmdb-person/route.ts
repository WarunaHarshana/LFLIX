import { NextResponse } from 'next/server';
import { cachedTmdbCall, getTmdbClient } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

type PersonCredit = {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    character: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    rating: number | null;
    year: string | null;
    popularity: number;
};

type CombinedCastCredit = {
    id: number;
    media_type: 'movie' | 'tv' | string;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
    character?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    overview?: string | null;
    vote_average?: number | null;
    release_date?: string;
    first_air_date?: string;
    popularity?: number;
};

type PersonInfoResponse = {
    id: number;
    name?: string;
    profile_path?: string | null;
    biography?: string | null;
    combined_credits?: {
        cast?: CombinedCastCredit[];
    };
};

function getCreditYear(credit: CombinedCastCredit): string | null {
    if (credit.release_date) return credit.release_date.substring(0, 4);
    if (credit.first_air_date) return credit.first_air_date.substring(0, 4);
    return null;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        const personId = parseInt(id, 10);
        if (Number.isNaN(personId)) {
            return NextResponse.json({ error: 'Invalid id parameter' }, { status: 400 });
        }

        const moviedb = getTmdbClient();

        const person = await cachedTmdbCall(`tmdb-person-${personId}`, () =>
            moviedb.personInfo({ id: personId, append_to_response: 'combined_credits' }),
            60
        ) as PersonInfoResponse;

        const creditsMap = new Map<string, PersonCredit>();
        const cast = person.combined_credits?.cast || [];

        for (const c of cast) {
            if (c.media_type !== 'movie' && c.media_type !== 'tv') continue;
            if (!c.id) continue;

            const mediaType = c.media_type as 'movie' | 'tv';
            const key = `${mediaType}:${c.id}`;
            const normalized: PersonCredit = {
                tmdbId: c.id,
                mediaType,
                title: mediaType === 'movie'
                    ? (c.title || c.original_title || 'Unknown')
                    : (c.name || c.original_name || 'Unknown'),
                character: c.character || null,
                posterPath: c.poster_path || null,
                backdropPath: c.backdrop_path || null,
                overview: c.overview || null,
                rating: c.vote_average || null,
                year: getCreditYear(c),
                popularity: c.popularity || 0,
            };

            const existing = creditsMap.get(key);
            if (!existing || (normalized.popularity > existing.popularity)) {
                creditsMap.set(key, normalized);
            }
        }

        const credits = Array.from(creditsMap.values()).sort((a, b) => {
            const yearA = parseInt(a.year || '0', 10);
            const yearB = parseInt(b.year || '0', 10);
            if (yearA !== yearB) return yearB - yearA;
            return (b.popularity || 0) - (a.popularity || 0);
        });

        return NextResponse.json({
            id: person.id,
            name: person.name || 'Unknown',
            profilePath: person.profile_path || null,
            biography: person.biography || null,
            credits,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('TMDB person error:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
