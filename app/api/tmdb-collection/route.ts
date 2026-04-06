import { NextResponse } from 'next/server';
import { MovieDb } from 'moviedb-promise';
import { getTmdbApiKey, cachedTmdbCall } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing collection id' }, { status: 400 });
        }

        const collectionId = parseInt(id, 10);
        if (Number.isNaN(collectionId) || collectionId <= 0) {
            return NextResponse.json({ error: 'Invalid collection id' }, { status: 400 });
        }

        const apiKey = getTmdbApiKey();
        const moviedb = new MovieDb(apiKey);

        const collection = await cachedTmdbCall(`collection-${collectionId}`, () =>
            moviedb.collectionInfo({ id: collectionId })
        );

        const parts = ((collection as any).parts || [])
            .sort((a: any, b: any) => {
                // Sort by release date ascending (chronological)
                const dateA = a.release_date || '9999';
                const dateB = b.release_date || '9999';
                return dateA.localeCompare(dateB);
            })
            .map((part: any) => ({
                tmdbId: part.id,
                title: part.title || 'Unknown',
                posterPath: part.poster_path || null,
                backdropPath: part.backdrop_path || null,
                overview: part.overview || null,
                rating: part.vote_average || null,
                year: part.release_date ? part.release_date.substring(0, 4) : null,
                releaseDate: part.release_date || null,
            }));

        return NextResponse.json({
            id: (collection as any).id,
            name: (collection as any).name || 'Unknown Collection',
            posterPath: (collection as any).poster_path || null,
            backdropPath: (collection as any).backdrop_path || null,
            overview: (collection as any).overview || null,
            parts,
        });
    } catch (e: any) {
        console.error('TMDB collection error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
