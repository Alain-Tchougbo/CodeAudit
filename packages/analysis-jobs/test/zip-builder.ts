import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntrySpec {
  name: string;
  data?: string | Buffer;
  mode?: number;
  encrypted?: boolean;
  method?: 0 | 8;
  claimedSize?: number;
  badCrc?: boolean;
}

export function zip(entries: ZipEntrySpec[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const source = Buffer.from(entry.data ?? '');
    const method = entry.method ?? 8;
    const data = method === 8 ? deflateRawSync(source) : source;
    const checksum = (crc32(source) ^ (entry.badCrc ? 1 : 0)) >>> 0;
    const flags = 0x800 | (entry.encrypted ? 1 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.claimedSize ?? source.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(0x314, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(flags, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(entry.claimedSize ?? source.length, 24);
    record.writeUInt16LE(name.length, 28);
    const attributes = (((entry.mode ?? (entry.name.endsWith('/') ? 0o40700 : 0o100600)) << 16) | (entry.name.endsWith('/') ? 0x10 : 0)) >>> 0;
    record.writeUInt32LE(attributes, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
