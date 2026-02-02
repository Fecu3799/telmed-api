import { dumpOpenHandles } from './utils/dump-open-handles';

export default function globalTeardown(): void {
  if (process.env.DEBUG_OPEN_HANDLES === '1') {
    dumpOpenHandles();
  }
}
