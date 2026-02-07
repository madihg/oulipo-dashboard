import { redirect } from 'next/navigation'

export default function Home() {
  // Default redirect to Gallery > Content Publisher
  redirect('/gallery/content-publisher')
}
