// 로그인 / 간단 가입 화면 (캐릭터는 가입 시 랜덤, 로그인 후 상단에서 바꾼다)
import { post } from './api.js';
import { mountAuthBackdrop } from './auth-backdrop.js';
import { h, toast } from './ui.js';

export function mountAuth(root, ctx) {
  let mode = 'login';
  const card = h('section', { class: 'card auth-card' });

  const backdrop = h('div', { class: 'auth-backdrop', 'aria-hidden': 'true' });
  root.append(h('main', { class: 'auth-page' }, backdrop, card));
  // 넓은 화면에서는 카드가 왼쪽을 가리므로 공부방을 오른쪽으로 민다
  const unmountBackdrop = mountAuthBackdrop(backdrop, { shiftX: matchMedia('(min-width: 861px)').matches ? 0.16 : 0 });

  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

  function draw() {
    const signup = mode === 'signup';
    const tab = (m, label) => h('button', {
      type: 'button', class: `tab${mode === m ? ' on' : ''}`, 'aria-pressed': String(mode === m),
      onClick: () => { mode = m; draw(); },
    }, label);
    card.replaceChildren(
      h('span', { class: 'logo auth-brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 's'), 'StudyPals'),
      h('div', { class: 'tabs' }, tab('login', '로그인'), tab('signup', '가입하기')),
      h('form', { class: 'stack', onSubmit: submit },
        field('아이디', h('input', { name: 'username', required: true, autocomplete: 'username',
          placeholder: '영문 소문자·숫자 3~20자', pattern: '[a-z0-9]{3,20}' })),
        field('비밀번호', h('input', { name: 'password', type: 'password', required: true, minLength: 6, maxLength: 72,
          placeholder: '6자 이상 입력',
          autocomplete: signup ? 'new-password' : 'current-password' })),
        signup && field('닉네임', h('input', { name: 'name', required: true, maxLength: 12, placeholder: '방에서 보일 이름' })),
        signup && h('small', {}, '캐릭터는 가입 후 캐릭터 메뉴에서 바꿀 수 있어요.'),
        h('button', { class: 'btn primary', type: 'submit' }, signup ? '가입하고 시작하기' : '로그인')));
  }

  async function submit(e) {
    e.preventDefault();
    const button = e.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const path = mode === 'signup' ? '/auth/signup' : '/auth/login';
      const { user } = await post(path, Object.fromEntries(new FormData(e.target)));
      ctx.onLogin(user);
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  }

  draw();
  return unmountBackdrop;
}
