import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StorageAdapter, MeetingRecord } from '../types';

interface MeetingDB extends DBSchema {
  meetings: {
    key: string;
    value: MeetingRecord;
    indexes: {
      'by-createdAt': number;
      'by-title': string;
    };
  };
}

class IndexedDBStorageAdapter implements StorageAdapter {
  id = 'indexeddb';
  name = 'IndexedDB存储';
  
  private db: IDBPDatabase<MeetingDB> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<MeetingDB>('MeetingRecorderDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('meetings')) {
          const store = db.createObjectStore('meetings', { keyPath: 'id' });
          store.createIndex('by-createdAt', 'createdAt');
          store.createIndex('by-title', 'title');
        }
      },
    });
  }

  async saveRecord(record: MeetingRecord): Promise<string> {
    if (!this.db) await this.init();
    await this.db!.put('meetings', record);
    return record.id;
  }

  async getRecord(id: string): Promise<MeetingRecord | null> {
    if (!this.db) await this.init();
    const result = await this.db!.get('meetings', id);
    return result ?? null;
  }

  async getAllRecords(): Promise<MeetingRecord[]> {
    if (!this.db) await this.init();
    return this.db!.getAllFromIndex('meetings', 'by-createdAt');
  }

  async updateRecord(record: MeetingRecord): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.put('meetings', record);
  }

  async deleteRecord(id: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.delete('meetings', id);
  }

  async searchRecords(query: string): Promise<MeetingRecord[]> {
    if (!this.db) await this.init();
    const allRecords = await this.db!.getAll('meetings');
    const lowerQuery = query.toLowerCase();
    return allRecords.filter(
      record => 
        record.title.toLowerCase().includes(lowerQuery) ||
        record.description.toLowerCase().includes(lowerQuery) ||
        record.segments.some(s => s.original.toLowerCase().includes(lowerQuery)) ||
        record.summary.toLowerCase().includes(lowerQuery)
    );
  }
}

export const indexedDBStorageAdapter = new IndexedDBStorageAdapter();

export default IndexedDBStorageAdapter;