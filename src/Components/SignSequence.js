import React from 'react';

const SignSequence = ({ signSequence = [] }) => {
  const tokens = signSequence.reduce((groups, sign) => {
    const previous = groups[groups.length - 1];
    if (previous && previous.token === sign.token) {
      previous.signs.push(sign);
      return groups;
    }

    return [...groups, { token: sign.token, signs: [sign] }];
  }, []);

  return (
    <section className="sequence-panel" aria-labelledby="sequence-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Translation</p>
          <h2 id="sequence-heading">Sign sequence</h2>
        </div>
        <span className="sequence-note">Alphabet dataset</span>
      </div>

      {tokens.length ? (
        <ol className="sequence-list">
          {tokens.map(({ token, signs }, index) => {
            const isWordSign = signs.some((sign) => sign.type === 'word');
            const hasUnavailableSign = signs.some((sign) => !sign.animationAvailable);
            const status = isWordSign ? 'Word sign available' : hasUnavailableSign ? 'Animation unavailable' : 'Fingerspelling';

            return (
              <li key={`${token}-${index}`} className="sequence-item">
                <strong>{token.toUpperCase()}</strong>
                <span>{status}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty-copy">Your translated sign sequence will appear here.</p>
      )}

      <p className="sequence-disclaimer">
        Each item is currently represented letter by letter because verified word-level sign animations are not available yet.
      </p>
    </section>
  );
};

export default SignSequence;
