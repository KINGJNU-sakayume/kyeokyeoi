import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 글꼴은 앱과 함께 배포해요 (CDN 없이 오프라인에서도 같은 모양). 필요한 글자 묶음만 그때그때 받아요.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/gowun-batang/400.css';
import '@fontsource/gowun-batang/700.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
