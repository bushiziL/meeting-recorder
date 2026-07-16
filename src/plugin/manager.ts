import type { 
  SpeechRecognizer, 
  LLMAdapter, 
  StorageAdapter, 
  PluginManifest, 
  PluginContext,
  EventName 
} from './types';
import { eventBus } from './eventBus';

class PluginManager {
  private speechRecognizers: Map<string, SpeechRecognizer> = new Map();
  private llmAdapters: Map<string, LLMAdapter> = new Map();
  private storageAdapters: Map<string, StorageAdapter> = new Map();
  private plugins: Map<string, PluginManifest> = new Map();
  private config: Map<string, unknown> = new Map();

  registerSpeechRecognizer(recognizer: SpeechRecognizer): void {
    this.speechRecognizers.set(recognizer.id, recognizer);
  }

  registerLLMAdapter(adapter: LLMAdapter): void {
    this.llmAdapters.set(adapter.id, adapter);
  }

  registerStorageAdapter(adapter: StorageAdapter): void {
    this.storageAdapters.set(adapter.id, adapter);
  }

  getSpeechRecognizer(id: string): SpeechRecognizer | undefined {
    return this.speechRecognizers.get(id);
  }

  getLLMAdapter(id: string): LLMAdapter | undefined {
    return this.llmAdapters.get(id);
  }

  getStorageAdapter(id: string): StorageAdapter | undefined {
    return this.storageAdapters.get(id);
  }

  getAllSpeechRecognizers(): SpeechRecognizer[] {
    return Array.from(this.speechRecognizers.values());
  }

  getAllLLMAdapters(): LLMAdapter[] {
    return Array.from(this.llmAdapters.values());
  }

  getAllStorageAdapters(): StorageAdapter[] {
    return Array.from(this.storageAdapters.values());
  }

  loadPlugin(manifest: PluginManifest): void {
    if (this.plugins.has(manifest.id)) {
      console.warn(`Plugin ${manifest.id} is already loaded`);
      return;
    }

    const context: PluginContext = {
      registerSpeechRecognizer: this.registerSpeechRecognizer.bind(this),
      registerLLMAdapter: this.registerLLMAdapter.bind(this),
      registerStorageAdapter: this.registerStorageAdapter.bind(this),
      on: (event: string, handler: (...args: unknown[]) => void) => {
        eventBus.on(event, handler);
      },
      emit: (event: string, ...args: unknown[]) => {
        eventBus.emit(event, ...args);
      },
      getConfig: this.getConfig.bind(this),
      setConfig: this.setConfig.bind(this),
    };

    if (manifest.extensions) {
      manifest.extensions.speechRecognizers?.forEach(this.registerSpeechRecognizer.bind(this));
      manifest.extensions.llmAdapters?.forEach(this.registerLLMAdapter.bind(this));
      manifest.extensions.storageAdapters?.forEach(this.registerStorageAdapter.bind(this));
    }

    if (manifest.init) {
      manifest.init(context);
    }

    this.plugins.set(manifest.id, manifest);
  }

  unloadPlugin(pluginId: string): void {
    const manifest = this.plugins.get(pluginId);
    if (!manifest) {
      console.warn(`Plugin ${pluginId} not found`);
      return;
    }

    if (manifest.destroy) {
      manifest.destroy();
    }

    if (manifest.extensions) {
      manifest.extensions.speechRecognizers?.forEach(r => {
        r.destroy();
        this.speechRecognizers.delete(r.id);
      });
      manifest.extensions.llmAdapters?.forEach(a => {
        this.llmAdapters.delete(a.id);
      });
      manifest.extensions.storageAdapters?.forEach(a => {
        this.storageAdapters.delete(a.id);
      });
    }

    this.plugins.delete(pluginId);
  }

  getConfig(key: string): unknown {
    return this.config.get(key);
  }

  setConfig(key: string, value: unknown): void {
    this.config.set(key, value);
    localStorage.setItem(`meeting-recorder:${key}`, JSON.stringify(value));
  }

  loadConfig(): void {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('meeting-recorder:')) {
        try {
          const value = JSON.parse(localStorage.getItem(key)!);
          this.config.set(key.replace('meeting-recorder:', ''), value);
        } catch {
          console.warn(`Failed to load config: ${key}`);
        }
      }
    });
  }

  on(event: EventName | string, handler: (...args: unknown[]) => void): void {
    eventBus.on(event, handler);
  }

  off(event: EventName | string, handler: (...args: unknown[]) => void): void {
    eventBus.off(event, handler);
  }

  emit(event: EventName | string, ...args: unknown[]): void {
    eventBus.emit(event, ...args);
  }
}

export const pluginManager = new PluginManager();

export default PluginManager;