// The official YouTube Data API's answers (v3: playlistItems.list and videos.list) for the INVENTED channel of
// tests/fixtures/real-site, in the shapes the API documents: every id, title and text is made up (demo). A module, not
// a .json file, so nothing of the tests can be swept into a deployment.

/** What the build is given as YOUTUBE_API_KEY in these tests: a made-up value that opens nothing. */
export const DEMO_CLAVE = 'clave-de-prueba-demo';

const CHANNEL = 'UCdemoCanalDePrueba00001';
const LIST = 'UULFdemoCanalDePrueba00001';

const item = (videoId: string, title: string, at: string, description: string, privacy = 'public', owner: string | null = CHANNEL) => ({
  kind: 'youtube#playlistItem',
  id: `item-${videoId}`,
  snippet: {
    publishedAt: at,
    channelId: CHANNEL,
    title,
    description,
    playlistId: LIST,
    resourceId: { kind: 'youtube#video', videoId },
    ...(owner ? { videoOwnerChannelId: owner, videoOwnerChannelTitle: 'Canal Demo' } : {}),
  },
  contentDetails: { videoId, ...(privacy === 'public' ? { videoPublishedAt: at } : {}) },
  status: { privacyStatus: privacy },
});

/** The list of long videos: two episodes, a private video (it stays in the list with a stand-in title) and an entry
 * whose id is not a YouTube id. */
export const API_PLAYLIST = {
  kind: 'youtube#playlistItemListResponse',
  items: [
    item('demoVideo01', 'Lo que viene esta semana | Programa Demo 12', '2026-10-31T19:47:50Z', 'Suscríbase (demo): https://www.youtube.com/@CanalDemo.oficial y https://x.com/cuenta_demo'),
    item('demoPrivad1', 'Private video', '2026-10-30T10:00:00Z', 'This video is private.', 'private', null),
    item('demoVideo03', 'PROGRAMA DEMO N°11 // VIERNES DE PRUEBA & MÁS (demo)', '2026-10-24T21:00:00Z', 'Otra descripción inventada (demo).'),
    item('corto', 'Un id que no es de YouTube (demo)', '2026-10-20T10:00:00Z', ''),
  ],
  pageInfo: { totalResults: 4, resultsPerPage: 24 },
};

/** How long each one is. */
export const API_VIDEOS = {
  kind: 'youtube#videoListResponse',
  items: [
    { kind: 'youtube#video', id: 'demoVideo01', contentDetails: { duration: 'PT4M25S' } },
    { kind: 'youtube#video', id: 'demoVideo03', contentDetails: { duration: 'PT1H50M26S' } },
  ],
};
