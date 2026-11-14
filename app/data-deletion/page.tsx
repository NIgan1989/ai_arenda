import {LegalInformation} from '../../components/legal-information';
export default async function Page({searchParams}:{searchParams:Promise<{from?:string}>}){const {from}=await searchParams;return <LegalInformation kind="deletion" from={from}/>;}
