import SignInScreen from '../../components/sign-in-screen';
export default async function SignIn({searchParams}:{searchParams:Promise<{next?:string;mode?:string}>}){const params=await searchParams;return <SignInScreen next={params.next} register={params.mode==='register'}/>;}
