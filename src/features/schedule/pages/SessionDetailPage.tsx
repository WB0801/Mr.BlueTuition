import { useParams } from 'react-router-dom'
import { SessionDetails } from '../components/SessionDetails'
export function SessionDetailPage() { const { sessionId = '' } = useParams(); return <SessionDetails sessionId={sessionId} /> }
