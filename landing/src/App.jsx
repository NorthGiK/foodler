const googlePlayUrl = "https://play.google.com/store/apps/details?id=com.Foodler.chih_pih";

function DownloadLink({ className = "", label = "Скачать для Android" }) {
  return (
    <a className={`download-link ${className}`.trim()} href={googlePlayUrl}>
      <span>{label}</span>
      <span aria-hidden="true">→</span>
    </a>
  );
}

function PhonePreview() {
  return (
    <section className="phone" aria-label="Пример экрана Foodler с расходами">
      <div className="phone-top">
        <span>Анализ за месяц</span>
        <span>⋯</span>
      </div>
      <p className="phone-total">23 842 ₽</p>
      <p className="phone-muted">на продукты</p>
      <div className="phone-rule" />
      <p className="phone-caption">Основные категории</p>
      <dl className="phone-list">
        <div><dt><i className="dot dot-red" />Сладкое</dt><dd>19%</dd></div>
        <div><dt><i className="dot dot-green" />Овощи</dt><dd>8%</dd></div>
        <div><dt><i className="dot dot-ink" />Напитки</dt><dd>21%</dd></div>
      </dl>
      <div className="phone-rule" />
      <p className="phone-caption">Динамика трат</p>
      <div className="bars" aria-label="Гистограмма трат">
        <span style={{ height: "46%" }} />
        <span style={{ height: "72%" }} />
        <span style={{ height: "54%" }} />
        <span style={{ height: "88%" }} />
        <span style={{ height: "63%" }} />
        <span style={{ height: "79%" }} />
      </div>
    </section>
  );
}

function AiPreview() {
  return (
    <section className="assistant-phone" aria-label="Пример советов Foodler AI">
      <div className="assistant-top">
        <span>Foodler AI</span>
        <span>Сегодня</span>
      </div>
      <p className="assistant-lead">Небольшие идеи для следующей корзины</p>
      <article className="ai-tip">
        <p className="tip-label">Сладкое · 19%</p>
        <p>Если хотите сократить спонтанные покупки, попробуйте добавить яблоки или ягоды вместо части привычных сладостей.</p>
      </article>
      <article className="ai-tip">
        <p className="tip-label">Напитки · 21%</p>
        <p>Вы часто выбираете воду из премиального сегмента. Сравните цену за литр — возможно, привычный вариант найдётся выгоднее.</p>
      </article>
      <article className="ai-tip ai-tip-accent">
        <p className="tip-label">Здоровее</p>
        <p>В покупках пока мало овощей. Попробуйте добавить к следующей корзине 2–3 привычные позиции.</p>
      </article>
      <button className="assistant-more" type="button">Ещё одна подсказка <span aria-hidden="true">→</span></button>
    </section>
  );
}

export function App() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Foodler, на главную">FOODLER</a>
        <p className="header-note">Приложение, которое<br />понимает ваши покупки</p>
        <nav aria-label="Основная навигация">
          <a href="#how-it-works">Как это работает</a>
          <a href="#about">О приложении</a>
          <a href="#privacy">Конфиденциальность</a>
        </nav>
        <DownloadLink className="header-download" />
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Всё о покупках — в одном месте</p>
          <h1>Ваша<br />продуктовая<br />жизнь —<br /><em>в ясных</em><br />цифрах.</h1>
          <p className="hero-summary">Сканируйте чеки, получайте понятные картины расходов и рекомендации, которые действительно помогают вашей семье.</p>
          <DownloadLink />
        </div>
        <div className="hero-media">
          <img src="/assets/hero-groceries.png" alt="Продукты и чек на крафтовой бумаге" />
          <PhonePreview />
        </div>
      </section>

      <section className="spending" id="about">
        <div className="spending-label">
          <p className="eyebrow">Куда уходят деньги</p>
          <p>Пример из истории<br />ваших покупок за месяц</p>
        </div>
        <dl className="spending-table">
          <div><dt><strong>19%</strong><span>Сладкое</span></dt><dd>Небольшие радости, которые легко не заметить</dd></div>
          <div><dt><strong>8%</strong><span>Овощи</span></dt><dd>Свежие продукты для ежедневной корзины</dd></div>
          <div><dt><strong>21%</strong><span>Напитки</span></dt><dd>Вода, соки, кофе и всё, что берёте на ходу</dd></div>
        </dl>
        <aside className="spending-aside">
          <span>За месяц</span>
          <b>23 842 ₽</b>
          <small>по чекам<br />и категориям</small>
        </aside>
      </section>

      <section className="editorial-quote">
        <img src="/assets/shopping-list.png" alt="Список покупок, помидоры и зелень на льняной ткани" />
        <div>
          <span className="quote-mark" aria-hidden="true">“</span>
          <blockquote>Не в том дело, сколько мы тратим. Важно — на что и как это влияет на нашу семью.</blockquote>
          <p>Foodler помогает увидеть привычки за цифрами и принимать спокойные решения без таблиц и ручного учёта.</p>
        </div>
      </section>

      <section className="steps" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">Как это работает</p>
          <h2>Один чек —<br />и картина<br />становится яснее.</h2>
        </div>
        <div className="step-list">
          <article className="step step-one">
            <span>01</span>
            <h3>Сканируйте чеки</h3>
            <p>Сфотографируйте бумажный чек или загрузите электронный — Foodler сохранит покупку.</p>
          </article>
          <article className="step step-two">
            <span>02</span>
            <h3>Понимайте свои траты</h3>
            <p>Смотрите категории, динамику и повторяющиеся паттерны расходов.</p>
          </article>
        </div>
        <article className="ai-section">
          <div className="ai-copy">
            <span>03</span>
            <p className="eyebrow">Foodler AI</p>
            <h3>Получайте<br />советы, которые<br />понимают контекст.</h3>
            <p>AI-помощник замечает повторяющиеся покупки и бережно подсказывает, где можно выбрать по-другому.</p>
            <p className="ai-disclaimer">Информационные рекомендации на основе истории покупок. Это не медицинские советы.</p>
          </div>
          <AiPreview />
        </article>
      </section>

      <section className="closing" id="download">
        <img src="/assets/grocery-tote.png" alt="Холщовая сумка с овощами, хлебом и покупками" />
        <div className="closing-copy">
          <p className="eyebrow">Foodler для Android</p>
          <h2>Больше осознанности.<br />Меньше рутины.<br /><em>Лучшее для своих.</em></h2>
          <p>Скачайте Foodler и начните видеть свои продуктовые привычки уже сегодня.</p>
          <DownloadLink />
        </div>
      </section>

      <footer id="privacy">
        <div className="footer-brand"><img src="/assets/foodler-icon.png" alt="" /> <span>FOODLER</span></div>
        <p>С заботой о ваших покупках<br />и вашем бюджете.</p>
        <div className="footer-links"><a href="#privacy">Конфиденциальность</a><a href="#privacy">Условия использования</a><span>Поддержка</span></div>
      </footer>
    </main>
  );
}
