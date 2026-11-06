'use client';
import {CalendarDays} from 'lucide-react';
import {ru} from 'date-fns/locale';
import {Calendar} from '../ui/calendar';
import {Button} from '../ui/button';
import {Popover,PopoverContent,PopoverTrigger} from '../ui/popover';
const day=(value:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Almaty'}).format(value);
export function DateRangeField({start,end,onChange}:{start:string;end:string;onChange:(value:{start:string;end:string})=>void}){
 const from=start?new Date(start.slice(0,10)+'T12:00:00+05:00'):undefined,to=end?new Date(end.slice(0,10)+'T12:00:00+05:00'):undefined;
 return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="date-range-trigger" aria-label="Выбрать даты в календаре"><CalendarDays size={17}/>{start&&end?start.slice(0,10).split('-').reverse().join('.')+' — '+end.slice(0,10).split('-').reverse().join('.'):'Даты поездки'}</Button></PopoverTrigger><PopoverContent align="start" className="rental-date-popover"><Calendar mode="range" locale={ru} timeZone="Asia/Almaty" selected={{from,to}} disabled={{before:new Date(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Almaty'})+'T00:00:00+05:00')}} onSelect={range=>onChange({start:range?.from?day(range.from)+'T'+(start.slice(11)||'14:00'):'',end:range?.to?day(range.to)+'T'+(end.slice(11)||'12:00'):''})}/><small>Время заезда и выезда можно уточнить в полях поиска.</small></PopoverContent></Popover>;
}
