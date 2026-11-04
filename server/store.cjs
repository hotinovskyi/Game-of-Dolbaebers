'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
class Store{
 constructor(filename){if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});this.db=new DatabaseSync(filename);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL,expires_at INTEGER NOT NULL,active_room TEXT);
 CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS commands(room TEXT NOT NULL,player TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(room,player,id));`);}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(err){this.db.exec('ROLLBACK');throw err;}}
 player(token,now){if(typeof token!=='string'||token.length>128)return null;return this.db.prepare('SELECT id,name,expires_at,active_room FROM players WHERE token_hash=? AND expires_at>?').get(crypto.createHash('sha256').update(token).digest('hex'),now)||null;}
 createPlayer(name,now){const token=crypto.randomBytes(32).toString('base64url'),id=crypto.randomUUID();this.db.prepare('INSERT INTO players VALUES(?,?,?,?,NULL)').run(id,crypto.createHash('sha256').update(token).digest('hex'),name,now+30*86400000);return{id,name,token};}
 getRoom(code){const row=this.db.prepare('SELECT data FROM rooms WHERE code=?').get(code);return row?JSON.parse(row.data):null;}
 saveRoom(room,now){room.updatedAt=now;this.db.prepare('INSERT INTO rooms VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(room.code,JSON.stringify(room,(key,value)=>key==='portrait'?undefined:value),now);}
 setActive(playerId,code){this.db.prepare('UPDATE players SET active_room=? WHERE id=?').run(code,playerId);}
 receipt(code,playerId,id){return this.db.prepare('SELECT digest FROM commands WHERE room=? AND player=? AND id=?').get(code,playerId,id);}
 record(code,playerId,id,digest){this.db.prepare('INSERT INTO commands VALUES(?,?,?,?)').run(code,playerId,id,digest);}
 cleanup(now){this.transaction(()=>{const expired=this.db.prepare('SELECT code FROM rooms WHERE updated_at<?').all(now-7*86400000);for(const row of expired){this.db.prepare('DELETE FROM commands WHERE room=?').run(row.code);this.db.prepare('UPDATE players SET active_room=NULL WHERE active_room=?').run(row.code);this.db.prepare('DELETE FROM rooms WHERE code=?').run(row.code);}this.db.prepare('DELETE FROM players WHERE expires_at<?').run(now);});}
 close(){this.db.close();}
}
module.exports={Store};
