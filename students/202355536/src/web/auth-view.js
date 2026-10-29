// 로그인 / 간단 가입 화면 (캐릭터는 가입 시 랜덤, 로그인 후 상단에서 바꾼다)
import { post } from './api.js';
import { h, toast } from './ui.js';

export function mountAuth(root, ctx) {
  let mode = 'login';
  const card = h('section', { class: 'card auth-card' });

  root.append(h('main', { class: 'auth-page' },
    h('a', { class: 'logo auth-brand', href: '#/login', 'aria-label': 'StudyPals 홈' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 's'), 'StudyPals'),
    h('div', { class: 'auth-hero' },
      h('span', { class: 'eyebrow' }, '나의 온라인 도서관'),
      h('h1', {}, '오늘 공부도', h('br'), '여기서 시작해요.'),
      h('p', { class: 'auth-description' }, '조용한 도서관에 자리를 잡고, 오늘 할 일을 펼쳐보세요.',
        h('br'), '같이 공부할 친구들이 기다리고 있어요.'),
      h('ol', { class: 'hero-points' },
        h('li', {}, h('span', {}, '01'), h('div', {}, h('strong', {}, '함께 앉는 공부방'), h('p', {}, '내 캐릭터로 입장하는 작은 3D 도서관'))),
        h('li', {}, h('span', {}, '02'), h('div', {}, h('strong', {}, '차곡차곡 쌓이는 시간'), h('p', {}, '공부한 시간과 하루의 기록을 한곳에'))),
        h('li', {}, h('span', {}, '03'), h('div', {}, h('strong', {}, '나만의 공부 계획'), h('p', {}, '과목별 할 일부터 10분 단위 시간표까지'))))),
    card));

  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

  function draw() {
    const signup = mode === 'signup';
    const tab = (m, label) => h('button', {
      type: 'button', class: `tab${mode === m ? ' on' : ''}`, 'aria-pressed': String(mode === m),
      onClick: () => { mode = m; draw(); },
    }, label);
    card.replaceChildren(
      h('div', { class: 'auth-card-heading' }, h('h2', {}, signup ? '첫 공부를 시작해볼까요?' : '다시 만나서 반가워요.'),
        h('p', {}, signup ? '간단한 가입으로 내 자리를 만들어보세요.' : '로그인하고 오늘의 공부를 이어가세요.')),
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
}
