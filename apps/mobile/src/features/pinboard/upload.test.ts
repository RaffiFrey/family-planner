import type { StoredFile } from '@fp/contracts';
import { AttachmentError, waitUntilReady } from './upload';

jest.mock('@/lib/api', () => ({ api: {} }));
jest.mock('@/features/files/file-transfer', () => ({}));

function file(status: StoredFile['status']): StoredFile {
  return {
    id: 'f',
    folderId: null,
    name: 'a.jpg',
    sizeBytes: 1,
    mimeType: 'image/jpeg',
    status,
    hasThumbnail: false,
    visibility: 'household',
    ownerMemberId: 'm',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

const noSleep = () => Promise.resolve();

describe('waitUntilReady', () => {
  it('polls until the file is ready', async () => {
    const states: StoredFile['status'][] = ['scanning', 'scanning', 'ready'];
    const getFile = jest.fn(() => Promise.resolve(file(states.shift() ?? 'ready')));
    await expect(waitUntilReady('h', 'f', getFile, noSleep)).resolves.toMatchObject({
      status: 'ready',
    });
    expect(getFile).toHaveBeenCalledTimes(3);
  });

  it('rejects infected files', async () => {
    const getFile = () => Promise.resolve(file('infected'));
    await expect(waitUntilReady('h', 'f', getFile, noSleep)).rejects.toBeInstanceOf(
      AttachmentError,
    );
  });
});
