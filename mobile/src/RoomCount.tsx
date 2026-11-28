import {forms,t} from '../../lib/i18n';
// «Номера одного типа» (lib/room-units.ts): a hotel, a hostel, an apart-hotel or a holiday resort fills one card for
// all its rooms alike and says how many there are. Guests see one card and how many of its rooms are free. «Свободно
// сегодня» is the one number the hotel gives from its own system: the rest of the rooms are closed until midnight.
// Board «Экраны старой версии» (2026-11-26): the row «Номера · 1 ›» in the place's list opens this sheet with the
// counters and one button pinned at the bottom.
import React,{useState} from 'react';
import {EditButton,EditCount,EditNote,EditSheet} from './EditSheet';
import {unitWords} from '../../lib/listings';
type Row=Record<string,any>;

// The line of the row «Номера» in the list: how many rooms and, with more than one, how many are free today. A card
// without units from the server is a single room.
// The words follow the kind (lib/listings.ts unitWords): rooms of a hotel, fields, tables, bays of a car wash.
export function roomsLine(property:Row):string{
 if(!property.id)return t('Не указано');
 const u:Row|undefined=property.units,total=Number(u?.total)||1,w=unitWords(property.details?.type);
 return total>1&&u?.free!==undefined?t(w.free,{free:u.free,total}):t(forms(total,...w.forms),{n:total});
}

export function RoomCount({property,call,onChanged,onBack,onClose}:{property:Row;call:(path:string,body:Row)=>Promise<any>;onChanged?:(rooms:Row)=>void;onBack:()=>void;onClose:()=>void}){
 const start:Row=property.units||{total:1,free:1,taken:0,closed:0},w=unitWords(property.details?.type),hotel=w.title==='Номера';
 const [rooms,setRooms]=useState<Row>(start),[count,setCount]=useState(Number(start.total)||1),[free,setFree]=useState(Number(start.free)||0);
 const [busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');
 async function save(path:string,body:Row){setBusy(true);setError('');setNote('');try{const r=await call(path,{propertyId:property.id,...body});setRooms(r.rooms);setCount(r.rooms.total);setFree(r.rooms.free);setNote(r.message||'');onChanged?.(r.rooms);}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 const open=Math.max(0,Number(rooms.total)-Number(rooms.taken||0)),many=count!==Number(rooms.total),freed=free!==Number(rooms.free);
 // One button saves what changed: the number of rooms first (its answer brings the free ones anew), then the free ones.
 const foot=<EditButton title={many?(hotel?t('Сохранить: {n} номеров',{n:count}):t('Сохранить: {n}',{n:count})):freed?t('Сохранить: свободно {n}',{n:free}):t('Сохранить')} disabled={!many&&!freed} busy={busy&&t('Сохраняем…')} onPress={()=>many?save('rooms/count',{count}):save('rooms/free',{free})}/>;
 return <EditSheet title={t(w.title)} onBack={onBack} onClose={onClose} busy={busy} foot={foot}>
  <EditCount title={t(w.count)} value={count} min={1} max={200} disabled={busy} onChange={setCount}/>
  <EditNote text={hotel?t('Одна карточка на все одинаковые номера. Гость видит, сколько из них свободно.'):t('Одна карточка на все одинаковые места. Гость бронирует любое свободное и видит, сколько их.')}/>
  {Number(rooms.total)>1&&<>
   <EditCount title={t('Свободно сегодня')} value={free} text={t('{free} из {total}',{free,total:rooms.total})} min={0} max={open} disabled={busy||many} onChange={setFree}/>
   <EditNote text={t('Через нас занято: {taken}. Закрыто вами: {closed}.',{taken:rooms.taken||0,closed:rooms.closed||0})+(rooms.repair?' '+t('На ремонте: {n}.',{n:rooms.repair}):'')}/>
  </>}
  {!!note&&<EditNote tone="done" text={note}/>}
  {!!error&&<EditNote tone="error" text={error}/>}
 </EditSheet>;
}
