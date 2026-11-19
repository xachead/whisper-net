package com.whispernet.repository;

import com.whispernet.model.SecretEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SecretRepository extends JpaRepository<SecretEntity, String> {

    long deleteByExpiresAtLessThan(Long now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SecretEntity s WHERE s.id = :id")
    Optional<SecretEntity> findByIdForUpdate(@Param("id") String id);
}
