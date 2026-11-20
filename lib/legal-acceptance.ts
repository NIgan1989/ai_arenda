import {DomainError} from './domain';
import {LEGAL_EDITION,legalDocument} from './legal-documents';
import {epoch,q,uuid,type Row} from './operation-core';

// Which documents a participant has accepted, in which edition, when and from where.
// Everyone accepts the user agreement and the personal data consent; an owner also accepts the owner offer, a cleaner
// the cleaner offer. Those offers carry the service's fees, the card charges and the AI administrator's powers, so the
// owner and cleaner workspaces of the app take no new actions until the current edition is accepted (app/api route).
// A new edition (LEGAL_EDITION) asks everyone again: silence is not acceptance (Civil Code art. 396 p. 2).
export type LegalDoc='terms'|'consent'|'owner'|'cleaner';
export type LegalClient='web'|'mobile';
const DOCS:LegalDoc[]=['terms','consent','owner','cleaner'];
export const isLegalDoc=(value:unknown):value is LegalDoc=>DOCS.includes(value as LegalDoc);

// The documents a role needs: the common two, plus the offer of a working role.
export function legalRequired(role:string|null|undefined):LegalDoc[]{
 return role==='owner'?['terms','consent','owner']:role==='cleaner'?['terms','consent','cleaner']:['terms','consent'];
}

// Statements that record acceptance; they go into the caller's batch, so the record lands with what it allows.
export function acceptanceStatements(db:D1Database,userId:string,docs:LegalDoc[],client:LegalClient,at=epoch()){
 return docs.map(doc=>q(db,'INSERT OR IGNORE INTO legal_acceptances(id,user_id,document,edition,client,accepted_at) VALUES (?,?,?,?,?,?)',uuid(),userId,doc,LEGAL_EDITION,client,at));
}

export async function acceptedDocs(db:D1Database,userId:string):Promise<LegalDoc[]>{
 const {results}=await q(db,'SELECT document FROM legal_acceptances WHERE user_id=? AND edition=?',userId,LEGAL_EDITION).all<Row>();
 return (results||[]).map(r=>r.document as LegalDoc);
}

// What the app shows: the edition, what the role still has to accept, with titles and pages for the sheet.
export async function legalState(db:D1Database,userId:string,role:string|null|undefined){
 const accepted=await acceptedDocs(db,userId),missing=legalRequired(role).filter(doc=>!accepted.includes(doc));
 return {edition:LEGAL_EDITION,accepted,missing,documents:missing.map(doc=>{const d=legalDocument(doc);return {id:doc,title:d.title,path:d.path};})};
}

// The missing documents of a role, or none. The route answers 428 with them, so the app can show the sheet.
export async function legalMissing(db:D1Database,userId:string,role:string|null|undefined){
 const accepted=await acceptedDocs(db,userId);
 return legalRequired(role).filter(doc=>!accepted.includes(doc));
}

export async function acceptLegal(db:D1Database,userId:string,body:Row,client:LegalClient){
 const docs=Array.isArray(body.documents)?[...new Set(body.documents)]:[];
 if(!docs.length||docs.length>DOCS.length||!docs.every(isLegalDoc))throw new DomainError('Выберите документы, которые принимаете.');
 // The person accepts the text they saw: an edition changed in between is read again first.
 if(body.edition!==LEGAL_EDITION)throw new DomainError('Документы обновились. Откройте новую редакцию и примите её.',409);
 await db.batch([...acceptanceStatements(db,userId,docs as LegalDoc[],client),q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),userId,userId,JSON.stringify({type:'legal.accepted',documents:docs,edition:LEGAL_EDITION,client}),epoch())]);
 return {message:'Условия приняты.',legal:await legalState(db,userId,typeof body.role==='string'?body.role:null)};
}
