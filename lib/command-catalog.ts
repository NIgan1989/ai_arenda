import type {Role} from './domain';

// The ready commands the AI administrator may pick in the chat. Each one is a single existing action of the service
// on one booking or one cleaning of the user's current role. The AI only prepares it: the user confirms the card,
// and the service checks rights, status and timing again when it runs. Money (payments, deposits, refunds) is not here.
export type CatalogCommand={role:Role;entity:'booking'|'job';action:string;title:string;note?:'required'|'optional';hint:string};
export const COMMAND_CATALOG:Record<string,CatalogCommand>={
 // Guest
 cancel_booking:{role:'guest',entity:'booking',action:'cancel',title:'Отменить бронь',hint:'гость отменяет свою бронь; условия возврата покажет сервис'},
 report_arrival:{role:'guest',entity:'booking',action:'report_checkin',title:'Сообщить, что я на месте',hint:'гость приехал'},
 report_leaving:{role:'guest',entity:'booking',action:'report_checkout',title:'Сообщить о выезде',hint:'гость уехал'},
 report_guest_late:{role:'guest',entity:'booking',action:'report_late',title:'Предупредить, что задерживаюсь',hint:'гость опаздывает к заезду'},
 // Owner
 confirm_booking:{role:'owner',entity:'booking',action:'confirm',title:'Подтвердить заявку',hint:'владелец подтверждает заявку гостя'},
 decline_booking:{role:'owner',entity:'booking',action:'reject',title:'Отклонить заявку',hint:'владелец отклоняет заявку гостя'},
 confirm_checkin:{role:'owner',entity:'booking',action:'checkin',title:'Подтвердить заселение',hint:'владелец подтверждает, что гость заселился'},
 confirm_checkout:{role:'owner',entity:'booking',action:'checkout',title:'Подтвердить выезд',hint:'владелец подтверждает, что жильё освободилось'},
 owner_cancel_booking:{role:'owner',entity:'booking',action:'cancel',title:'Отменить бронь гостя',hint:'владелец отменяет бронь; условия возврата покажет сервис'},
 accept_cleaning:{role:'owner',entity:'job',action:'approve',title:'Принять уборку',hint:'владелец принимает отчёт об уборке'},
 return_cleaning:{role:'owner',entity:'job',action:'revise',title:'Вернуть уборку на доработку',note:'required',hint:'владелец возвращает отчёт; note — что доделать'},
 cancel_cleaning:{role:'owner',entity:'job',action:'cancel',title:'Отменить уборку',note:'required',hint:'владелец отменяет задание; note — причина'},
 // Cleaner
 apply_cleaning:{role:'cleaner',entity:'job',action:'apply',title:'Откликнуться на уборку',hint:'исполнитель берёт открытое задание'},
 withdraw_application:{role:'cleaner',entity:'job',action:'withdraw',title:'Отозвать отклик',hint:'исполнитель передумал до ответа владельца'},
 start_cleaning:{role:'cleaner',entity:'job',action:'start',title:'Начать уборку',hint:'исполнитель начинает назначенную уборку'},
 report_cleaner_late:{role:'cleaner',entity:'job',action:'late',title:'Предупредить об опоздании на уборку',hint:'исполнитель опаздывает на 30 минут'},
 report_at_door:{role:'cleaner',entity:'job',action:'at_door',title:'Сообщить владельцу: я на месте',hint:'исполнитель у двери после гостей и ждёт сигнала владельца; выезд подтверждает владелец'},
 report_guest_here:{role:'cleaner',entity:'job',action:'guest_here',title:'Сообщить владельцу: гость ещё здесь',hint:'исполнитель пришёл, а гость ещё в жилье; решает владелец'},
};
export const catalogText=()=>Object.entries(COMMAND_CATALOG).map(([k,c])=>k+' ('+({guest:'гость',owner:'владелец',cleaner:'исполнитель'} as Record<string,string>)[c.role]+', '+(c.entity==='booking'?'bookingId':'jobId')+'): '+c.hint).join('; ');
